import psycopg2
import os
import sys
import configparser
import json
import logging
from logging.handlers import RotatingFileHandler

CONFIDENCE_TOL = 99.0
SHARPNESS_TOL = 50.0
MIN_FACE_SIZE = 900 # pixels
MAX_FACE_ASPECT_RATIO = 2 # A face must be 2 units taller than wider

def setup_logger(log_dir, module_name, log_file, log_size=10*1024*1024, backup_count=10):
    os.makedirs(log_dir, exist_ok=True)
    logger = logging.getLogger(module_name)
    logger.setLevel(logging.DEBUG)
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, log_file),
        maxBytes=log_size,
        backupCount=backup_count
    )
    formatter = logging.Formatter('%(asctime)s:%(name)s:%(levelname)s:%(message)s')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    logger.addHandler(console_handler)
    return logger

def get_db_config(filename='params.cfg', section='postgresql'):
    # Create a parser
    parser = configparser.ConfigParser()
    # Read the configuration file
    parser.read(filename)

    # Get the section, default to postgresql
    db_params = {}
    if parser.has_section(section):
        params = parser.items(section)
        for param in params:
            db_params[param[0]] = param[1]
    else:
        raise Exception(f'Section {section} not found in the {filename} file')

    return db_params


def get_folder(conn, folder):
    path_name = '/' + folder + '/'
    cursor = conn.cursor()
    cursor.execute("""
        SELECT folder_id, path, name, path_name, folder_level
        FROM mbox_folder
        WHERE path_name = %s
        LIMIT 1
    """, (path_name,))
    result = cursor.fetchone()
    return result


def create_folder(conn, folder, parent_folder=None):
    parent_id = 1
    path = '/'
    folder_level = 1
    if parent_folder:
        parent_id = parent_folder[0]
        path = parent_folder[3]
        folder_level = parent_folder[4] + 1

    cursor = conn.cursor()
    insert_query = """
        INSERT INTO mbox_folder (name,path,parent_id,folder_level)
        VALUES (%s, %s, %s, %s) RETURNING folder_id;
    """

    cursor.execute(insert_query, (folder,path,parent_id,folder_level))
    folder_id = cursor.fetchone()[0]
    cursor.close()
    return folder_id


def get_video_id(conn, folder_id, file_name):
    query = "SELECT file_id FROM mbox_file WHERE folder_id = %s AND name = %s LIMIT 1"
    with conn.cursor() as cursor:
        cursor.execute(query, (folder_id, file_name))
        fileobj = cursor.fetchone()
        if fileobj:
            return fileobj[0]
    return None


def update_video(conn, video_id, thumbnail_id, thumbnail_offset):
    query = "UPDATE mbox_file SET thumbnail_id = %s, thumbnail_offset = %s WHERE file_id = %s"
    with conn.cursor() as cursor:
        cursor.execute(query, (thumbnail_id, thumbnail_offset, video_id))
        rowcount = cursor.rowcount
    return rowcount > 0


def check_if_empty(conn, video_id):
    query = "SELECT face_id FROM mbox_face WHERE file_id = %s LIMIT 1"
    with conn.cursor() as cursor:
        cursor.execute(query, (video_id,))
        result = cursor.fetchone()
        return result is None


def store_thumbnail(conn, bucket_name, folder_name, thumb_type):
    label = f"{bucket_name}__{folder_name}__{thumb_type}"
    with conn.cursor() as cursor:
        cursor.execute("SELECT thumbnail_id FROM mbox_thumbnail WHERE label = %s", (label,))
        result = cursor.fetchone()

    if result:
        return result[0]

    media_root = os.environ.get('MBOX_MEDIA_ROOT')
    thumbs_path = os.path.join(media_root, label + ".dat")

    if not os.path.exists(thumbs_path):
        return None

    with conn.cursor() as cursor:
        cursor.execute("""
            INSERT INTO mbox_thumbnail(path,label) VALUES (%s, %s)
            RETURNING thumbnail_id
        """, (thumbs_path, label))
        return cursor.fetchone()[0]


def store_faces(conn, video_id, results, thumbnail_id):
    cursor = conn.cursor()

    metadata = results['VideoMetadata']
    width = float(metadata['FrameWidth'])
    height = float(metadata['FrameHeight'])
    framerate = float(metadata['FrameRate'])
    blob_offset = results['BlobOffset']

    count = 0
    
    faces = results['Faces']
    for face in faces:
        confidence = float(face['Face']['Confidence'])
        sharpness = float(face['Face']['Quality']['Sharpness'])

        bounding_box = face['Face']['BoundingBox']
        box_w = int(float(bounding_box['Width']) * width)
        box_h = int(float(bounding_box['Height']) * height)
        box_x = int(float(bounding_box['Left']) * width) 
        box_y = int(float(bounding_box['Top']) * height) 
        bounding_box['Width'] = box_w
        bounding_box['Height'] = box_h
        bounding_box['Left'] = box_x
        bounding_box['Top'] = box_y

        time_start = float(face['Timestamp'])/1000.0
        time_end = time_start + 1.0/framerate
        pose = face['Face']['Pose']
        quality = face['Face']['Quality']
        gender = face['Face']['Gender']
        age_range = face['Face']['AgeRange']
        embedding = face['Face']['Embedding']
        thumbnail_offset = face['Face']['ThumbnailOffset'] + blob_offset

        insert_query = """
            INSERT INTO mbox_face (file_id,anchor_time,time_start,time_end,
                box,pose,quality,
                gender,age_range,confidence,
                thumbnail_id,thumbnail_offset,embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(insert_query, (video_id, time_start, time_start, time_end, 
                       json.dumps(bounding_box), json.dumps(pose), json.dumps(quality), 
                       json.dumps(gender), json.dumps(age_range), confidence,
                       thumbnail_id, thumbnail_offset, embedding))

        count = count + 1

    cursor.close()
    return count


def save_faces(conn, input_dir, bucket_name, folder_name):
    global logger
    folder_id = 0

    # Get a folder for this bucket
    bucket_folder = get_folder(conn, bucket_name)
    if bucket_folder is None:
        logger.error(f"{bucket_name} does not exist. Upload metadata first.")
        return
    logger.info(f"Bucket folder: {bucket_folder}")

    # Get a folder for this batch
    path_name = f"{bucket_name}/{folder_name}"
    batch_folder = get_folder(conn, path_name)
    if batch_folder is None:
        logger.error(f"{path_name} does not exist. Upload metadata first.")
        return
    print(f"Batch folder: {batch_folder}")
    folder_id = batch_folder[0]

    video_count = 0
    face_count = 0

    for filename in os.listdir(input_dir):
        if not filename.endswith(".faces"):
            continue

        logger.info(f"Storing {filename} to {bucket_name}/{folder_name} ...")
        filepath = os.path.join(input_dir, filename)

        faces = None
        with open(filepath, 'r') as file:
            faces = json.load(file)

        video_id = get_video_id(conn, folder_id, faces["VideoFile"])
        if video_id is None:
            logger.warning(f"{faces['VideoFile']} not found.")
            continue

        video_count += 1

        # Store video thumbnails
        thumbnail_id = store_thumbnail(conn, bucket_name, folder_name, "thumbs")
        if thumbnail_id is None:
            logger.error(f"{bucket_name}__{folder_name}__thumbs.dat not found.")
            continue

        thumbnail_offset = faces["ThumbnailOffset"]
        if not update_video(conn, video_id, thumbnail_id, thumbnail_offset):
            logger.error(f"Unable to update {bucket_name}/{folder_name}/{faces['VideoFile']}")
            continue

        # Check if the face records have previously been loaded
        if not check_if_empty(conn, video_id):
            logger.info(f"{filename} already has face records. Skipping ...")
            continue

        # Store faces thumbnails
        thumbnail_id = store_thumbnail(conn, bucket_name, folder_name, "faces")
        if thumbnail_id is None:
            logger.error(f"{bucket_name}_{folder_name}__faces.dat not found.")
            continue

        processed = store_faces(conn, video_id, faces, thumbnail_id)
        face_count += processed

        logger.info(f"{bucket_name}/{folder_name}/{filename}: {processed} faces saved.")

    logger.info(f"{video_count} files processed.")
    logger.info(f"{face_count} processed.")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: python {sys.argv[0]} <input_dir> <bucket> <folder> [<confidence>] [<sharpness>]")
        print("<input_dir> is the directory containing the outputs of detect faces.")
        print("<bucket>/<folder> is the path where the video files will be stored.")
        sys.exit(1)

    input_dir = sys.argv[1]
    bucket_name = sys.argv[2]
    folder_name = sys.argv[3]

    # Setup logger and shout out
    global logger
    logger = setup_logger('logs','upload_faces','facebox.log')
    logger.info("*********************************************************************************")
    logger.info("* SAVE/INSERT FACE RECORDS TO THE DATABASE **************************************")
    logger.info("*********************************************************************************")

    # PostgreSQL connection
    params = get_db_config()
    conn = psycopg2.connect(**params)

    save_faces(conn, input_dir, bucket_name, folder_name)

    conn.commit()
    conn.close()

