import os
import sys
import json
import psycopg2
import configparser
from psycopg2.extras import Json

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


def adapt_dict(data):
    if isinstance(data, dict):
        return Json(data)
    return data


def import_folder(cursor, folder_data, root_folder):
    folder_data = folder_data.copy()
    subfolders = folder_data.pop('subfolders', [])
    files = folder_data.pop('files', [])
    folder_data = {k: adapt_dict(v) for k, v in folder_data.items()}

    # Remove the trailing slash, construct the path_name
    if root_folder == '/':
        path_name = folder_data['path'] + folder_data['name'] + '/'
    else:
        root_folder = root_folder[:-1] if root_folder[:-1] == "/" else root_folder
        path_name = root_folder + folder_data['path'] + folder_data['name'] + '/'

    # Find the path/name in the specified root folder
    print(f"Fetching folder record for {path_name}")
    cursor.execute(
        "SELECT folder_id, path_name, path, name FROM mbox_folder WHERE path_name = %s",
        (path_name,)
    )
    folder = cursor.fetchone()
    if folder is None:
        raise Exception(f"{path_name} does not exist.")

    folder_id = folder[0]

    for subfolder in subfolders:
        import_folder(cursor, subfolder, path_name)

    for file in files:
        import_file(cursor, file, folder_id)

    return folder_id


def import_file(cursor, file_data, folder_id):
    file_data = file_data.copy()
    faces = file_data.pop('faces', [])
    voices = file_data.pop('voices', [])
    file_data = {k: adapt_dict(v) for k, v in file_data.items()}

    print(f"Fetching file record for {file_data['name']}")
    cursor.execute(
        "SELECT file_id, name FROM mbox_file WHERE folder_id = %s AND name = %s",
        (folder_id, file_data['name'])
    )
    file = cursor.fetchone()
    if file is None:
        raise Exception(f"{file_data['name']} does not exist in the specified folder.")

    file_id = file[0]

    # Update the thumbnail_offset
    print(f"Updating thumbnail offset of {file_data['name']} to {file_data['thumbnail_offset']} ...")
    cursor.execute(
        "UPDATE mbox_file SET thumbnail_offset = %s WHERE file_id = %s",
        (file_data['thumbnail_offset'], file_id))
    if cursor.rowcount == 0:
        raise Exception(f"Unable to update the thumbnail offset of {file_data['name']}")

    count = count_faces(cursor, file_id)
    if count == 0:
        for face in faces:
            insert_face(cursor, face, file_id)
    else:
        print(f"Found {count} face records for {file_data['name']}. Skipping ...")

    count = count_voices(cursor, file_id)
    if count == 0:
        for voice in voices:
            insert_voice(cursor, voice, file_id)
    else:
        print(f"Found {count} voice records for {file_data['name']}. Skipping ...")


def count_faces(cursor, file_id):
    cursor.execute("SELECT COUNT(*) FROM mbox_face WHERE file_id = %s", (file_id,))
    return cursor.fetchone()[0]


def insert_face(cursor, face_data, file_id):
    face_data = face_data.copy()
    face_data.pop('face_id', None)  # Remove face_id as it will be auto-generated
    face_data.pop('person_id', None)  # Remove person_id as it will be auto-generated
    face_data['file_id'] = file_id
    face_data = {k: adapt_dict(v) for k, v in face_data.items()}

    columns = ', '.join(face_data.keys())
    values = ', '.join(['%s'] * len(face_data))
    
    cursor.execute(f"""
        INSERT INTO mbox_face ({columns})
        VALUES ({values})
    """, list(face_data.values()))


def count_voices(cursor, file_id):
    cursor.execute("SELECT COUNT(*) FROM mbox_voice WHERE file_id = %s", (file_id,))
    return cursor.fetchone()[0]


def insert_voice(cursor, voice_data, file_id):
    voice_data = voice_data.copy()
    voice_data.pop('voice_id', None)  # Remove voice_id as it will be auto-generated
    voice_data.pop('person_id', None)  # Remove person_id as it will be auto-generated
    voice_data['file_id'] = file_id
    voice_data = {k: adapt_dict(v) for k, v in voice_data.items()}

    columns = ', '.join(voice_data.keys())
    values = ', '.join(['%s'] * len(voice_data))
    
    cursor.execute(f"""
        INSERT INTO mbox_voice ({columns})
        VALUES ({values})
    """, list(voice_data.values()))


def get_thumbnail(cursor, label):
    cursor.execute("SELECT thumbnail_id FROM mbox_thumbnail WHERE label = %s", (label,))
    return cursor.fetchone()

def configure_thumbnails(cursor, bucket_name, folder_name, folder_id, thumbs_dat, faces_dat):
    # Get the media root
    media_root = os.environ.get('MBOX_MEDIA_ROOT')
    if not media_root:
        media_root = '/mbox/thumbnails/'

    # Create record for file thumbnails
    label = f"{bucket_name}__{folder_name}__thumbs"
    if get_thumbnail(cursor, label) is None:
        thumbs_path = media_root + label + ".dat"
        cursor.execute("""
            INSERT INTO mbox_thumbnail(path,label) VALUES (%s, %s)
            RETURNING thumbnail_id
        """, (thumbs_path, label))
        thumbnail_id = cursor.fetchone()[0]

        # Link the files to the thumbnail record
        cursor.execute("""
            UPDATE mbox_file SET thumbnail_id = %s WHERE folder_id = %s
        """, (thumbnail_id, folder_id))
    else:
        print(f"Thumbnail record for {label} already exists.")

    # Create record for the face thumbnails
    label = f"{bucket_name}__{folder_name}__faces"
    if get_thumbnail(cursor, label) is None:
        faces_path = media_root + label + ".dat"
        cursor.execute("""
            INSERT INTO mbox_thumbnail(path,label) VALUES (%s, %s)
            RETURNING thumbnail_id
        """, (faces_path, label))
        thumbnail_id = cursor.fetchone()[0]

        # Link the faces to the thumbnail record
        cursor.execute("""
            UPDATE mbox_face SET thumbnail_id = %s
            WHERE file_id IN (SELECT file_id FROM mbox_file WHERE folder_id = %s)
        """, (thumbnail_id, folder_id))
    else:
        print(f"Thumbnail record for {label} already exists.")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: python {sys.argv[0]} <input_json> <thumbs_dat> <faces dat> [<root folder>]")
        print("This program will import the folders, files, faces and voices into the database.")
        print("<input_json> is the output of export_db.py, its filename must be <bucket>__<folder>.json")
        print("<thumbs_dat> is the dat file containing the file thumbnails.")
        print("<faces_dat> is the dat file containing the faces thumbnails.")
        print("[<root folder>] is the folder where matching folder structure is found. Default is '/'.")
        sys.exit(1)

    input_file = sys.argv[1]
    thumbs_dat = sys.argv[2]
    faces_dat = sys.argv[3]

    root_folder = "/"
    if len(sys.argv) == 5:
        root_folder = sys.argv[4]

    # Check if the files exist
    if not os.path.exists(input_file):
        print(f"{input_file} not found.")
        sys.exit(1)

    if not os.path.exists(thumbs_dat):
        print(f"{thumbs_dat} not found.")
        sys.exit(1)

    if not os.path.exists(faces_dat):
        print(f"{faces_dat} not found.")
        sys.exit(1)

    params = get_db_config()

    conn = psycopg2.connect(**params)
    if conn is None:
        print("Unable to connect to the database.")
        sys.exit(1)

    cursor = conn.cursor()

    with open(input_file, 'r') as f:
        data = json.load(f)

    folder_id = import_folder(cursor, data, root_folder)
    print(f"Data imported successfully from {input_file}")

    filename = os.path.splitext(os.path.basename(input_file))[0]
    bucket_name, folder_name, temp = filename.split('__')
    configure_thumbnails(cursor, bucket_name, folder_name, folder_id, thumbs_dat, faces_dat)

    cursor.close()
    conn.commit()
    conn.close()

