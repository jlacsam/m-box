import os
import sys
import csv
import json
import psycopg2
import argparse
import configparser
from psycopg2.extras import execute_values

DEFAULT_OWNER_NAME = "root"
DEFAULT_GROUP_NAME = "editors"

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

def get_file(conn, path_name, filename):
    cursor = conn.cursor()
    cursor.execute("""
        SELECT f.file_id, d.path_name, f.name, f.media_type
        FROM mbox_file f JOIN mbox_folder d ON f.folder_id = d.folder_id
        WHERE d.path_name = %s AND f.name = %s
    """, (path_name, filename))
    result = cursor.fetchone()
    return result

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

def get_thumbnail(conn, bucket_name, folder_name, thumb_type='chunks'):
    label = f"{bucket_name}__{folder_name}__{thumb_type}"
    cursor = conn.cursor()
    cursor.execute("""
        SELECT thumbnail_id, path, used, capacity, label
        FROM mbox_thumbnail
        WHERE label = %s
        LIMIT 1
    """, (label,))
    thumbnail = cursor.fetchone()
    cursor.close()
    return thumbnail # tuple

def get_owner_id(conn, owner_name):
    with conn.cursor() as cursor:
        cursor.execute("SELECT id FROM auth_user WHERE username = %s", (owner_name,))
        row = cursor.fetchone()
        return row[0] if row else None

def get_group_id(conn, group_name):
    with conn.cursor() as cursor:
        cursor.execute("SELECT id FROM auth_group WHERE name = %s", (group_name,))
        row = cursor.fetchone()
        return row[0] if row else None

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

def add_media(conn, foldername, folder_id, filename, media_type):
    cursor = conn.cursor()
    extension = os.path.splitext(filename)[1]
    storage_key = foldername + '/' + filename
    insert_query = """
        INSERT INTO mbox_file (folder_id,name,extension,storage_key,media_type)
        VALUES (%s, %s, %s, %s, %s) RETURNING file_id;
    """
    cursor.execute(insert_query, (folder_id, filename, extension, storage_key, media_type))
    file_id = cursor.fetchone()[0]
    cursor.close()
    return file_id

def update_media1(conn, file_id, file_size, syn_content, vtt_content, people, places):
    """Updates the PostgreSQL database with the given information."""
    cursor = conn.cursor()

    # Update the fbx_file table
    update_query = """
        UPDATE mbox_file
        SET size = %s, 
            description = %s,
            webvtt = %s,
            people = %s,
            places = %s
        WHERE file_id = %s;
    """
    cursor.execute(update_query, (file_size, syn_content, vtt_content, people, places, file_id))
    count = cursor.rowcount
    cursor.close()
    return count

def update_media2(conn, file_id, file_url, attributes, extra_data):
    """Updates the PostgreSQL database with the given information."""
    cursor = conn.cursor()

    json_a = json.dumps(attributes)
    json_e = json.dumps(extra_data)
    title = extra_data['TitleInfo'][:255]
    remarks = extra_data['Remarks']

    # Update the fbx_file table
    update_query = """
        UPDATE mbox_file
        SET file_url = %s,
            attributes = %s,
            extra_data = %s,
            title = %s,
            remarks = %s
        WHERE file_id = %s;
        """
    cursor.execute(update_query, (file_url, json_a, json_e, title, remarks, file_id))
    count = cursor.rowcount
    cursor.close()
    return count

def load_uris(filename):
    uris_dict = {}
    with open(filename, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            filename = row['FileName']
            uris_dict[filename] = row['SasUri']
    return uris_dict

def load_metadata(filename):
    metadata_dict = {}
    with open(filename, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            metadata_dict[row['FileName']] = {
                'ControlNo': row['ControlNo'],
                'MaterialType': row['MaterialType'],
                'TitleInfo': row['TitleInfo'],
                'Remarks': row['Remarks']
            }
    return metadata_dict


def load_attributes(attributes_file):
    attribs_dict = {}
    with open(attributes_file, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        headers = reader.fieldnames
        for row in reader:
            filename = row['filename']
            attribs_dict[filename] = {header: row[header] for header in headers}
    return attribs_dict


def are_columns_empty(conn, file_id, columns):
    # Construct the SQL query which looks like this:
    # SELECT ((name IS NULL) AND (tags IS NULL) AND (remarks IS NULL))
    # FROM users
    # WHERE id = %s

    columns_to_check = ' AND '.join([f"({col} IS NULL)" for col in columns])
    query = f"""
        SELECT ({columns_to_check})
        FROM mbox_file
        WHERE file_id = %s
    """

    # Execute the query
    with conn.cursor() as cursor:
        cursor.execute(query, (file_id,))
        result = cursor.fetchone()
        return bool(result and result[0])


def has_embeddings(conn, file_id):
    with conn.cursor() as cursor:
        cursor.execute("SELECT chunk_id FROM mbox_transcript WHERE file_id = %s LIMIT 1", (file_id,))
        return cursor.fetchone() is not None


def insert_embeddings(conn, file_id, embeddings):
    cursor = conn.cursor()
    query = """
        INSERT INTO mbox_transcript (file_id, chunk, source, time_start, time_end, embedding)
        VALUES %s
    """
    # Prepare data for bulk insertion
    values = [
        (file_id, chunk['text'], chunk['source'], chunk['time_start'], chunk['time_end'], chunk['embedding'])
        for chunk in embeddings
    ]
    execute_values(cursor, query, values)
    cursor.close()


def insert_dat(conn, file_id, bucket_name, folder_name):
    cursor = conn.cursor()
    # Create record for file thumbnails
    label = f"{bucket_name}__{folder_name}__chunks"
    media_root = os.environ.get('MBOX_MEDIA_ROOT')
    if media_root is None:
        print("Environment variable MBOX_MEDIA_ROOT is not defined. Assuming current directory ...")
        media_root = "thumbnails"

    thumbs_path = os.path.join(media_root, label + ".dat")
    if not os.path.exists(thumbs_path):
        print(f"{thumbs_path} not found.")

    file_size = os.path.getsize(thumbs_path)
    cursor.execute("""
        INSERT INTO mbox_thumbnail(path,label,used) VALUES (%s, %s, %s)
        RETURNING thumbnail_id
    """, (thumbs_path, label, file_size))
    thumbnail_id = cursor.fetchone()[0]
    cursor.close()
    return thumbnail_id


def update_offsets(conn, thumbnail_id, file_id, offsets):
    cursor = conn.cursor()
    for offset in offsets:
        time_start = offset['time_start']
        time_end = offset['time_end']
        thumbnail_offset = offset['thumbnail_offset']
        query = """
            UPDATE mbox_transcript
            SET thumbnail_id = %s,
                thumbnail_offset = %s
            WHERE file_id = %s AND time_start = %s AND time_end = %s
        """
        cursor.execute(query, (thumbnail_id, thumbnail_offset, file_id, time_start, time_end))
        if cursor.rowcount != 1:
            print(f"Unable to update thumbnail offset for file ID {file_id} " \
                         f"at {time_start:.3f}/{time_end:.3f}")
    cursor.close()


def update_folder_owner(conn, folder_id, owner_id, owner_name):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE mbox_folder SET owner_id = %s, owner_name = %s
            WHERE folder_id = %s AND (owner_id IS NULL OR owner_id <> %s)
        """, (owner_id, owner_name, folder_id, owner_id))
        return cursor.rowcount


def update_folder_group(conn, folder_id, group_id, group_name):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE mbox_folder SET group_id = %s, group_name = %s
            WHERE folder_id = %s AND (group_id IS NULL OR group_id <> %s)
        """, (group_id, group_name, folder_id, group_id))
        return cursor.rowcount


def update_file_owner(conn, file_id, owner_id, owner_name):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE mbox_file SET owner_id = %s, owner_name = %s
            WHERE file_id = %s AND (owner_id IS NULL OR owner_id <> %s)
        """, (owner_id, owner_name, file_id, owner_id))
        return cursor.rowcount


def update_file_group(conn, file_id, group_id, group_name):
    with conn.cursor() as cursor:
        cursor.execute("""
            UPDATE mbox_file SET group_id = %s, group_name = %s
            WHERE file_id = %s AND (group_id IS NULL OR group_id <> %s)
        """, (group_id, group_name, file_id, group_id))
        return cursor.rowcount


def upload_to_db(conn, data_dir, container, folder, owner_name="admin", group_name="editors"):
    """Processes all .json files in the specified directory."""
    folder_id = 0

    # Get owner_id and group_id
    owner_id = get_owner_id(conn, owner_name)
    if owner_id is None:
        print(f"User '{owner_name}' not found.")
        sys.exit(1)

    group_id = get_group_id(conn, group_name)
    if group_id is None:
        print(f"Group '{group_name}' not found.")
        sys.exit(1)

    # Get/Create an mbox folder for this container/bucket
    mbox_container = get_folder(conn, container)
    if mbox_container is None:
        folder_id = create_folder(conn, container)
        mbox_container = get_folder(conn, container)
    else:
        folder_id = mbox_container[0]

    # Update owner and group of container
    affected = update_folder_owner(conn, folder_id, owner_id, owner_name)
    print(f"Folder owner of {container} is {'updated' if affected else 'unchanged'}.")
    affected = update_folder_group(conn, folder_id, group_id, group_name)
    print(f"Folder group of {container} is {'updated' if affected else 'unchanged'}.")

    # Get/Create an mbox folder for this folder/batch
    path_name = f"{container}/{folder}"
    mbox_folder = get_folder(conn, path_name)
    if mbox_folder is None:
        folder_id = create_folder(conn, folder, mbox_container)
        mbox_folder = get_folder(conn, path_name)
    else:
        folder_id = mbox_folder[0]

    # Update owner and group of folder
    affected = update_folder_owner(conn, folder_id, owner_id, owner_name)
    print(f"Folder owner of {folder} is {'updated' if affected else 'unchanged'}.")
    affected = update_folder_group(conn, folder_id, group_id, group_name)
    print(f"Folder group of {folder} is {'updated' if affected else 'unchanged'}.")

    # Load file uris, attribs & metadata
    filename = f"{data_dir}/{container}/{container}__{folder}.uri"
    uris_dict = load_uris(filename)

    filename = f"{data_dir}/{container}/{container}__{folder}.csv"
    metadata_dict = load_metadata(filename)

    filename = f"{data_dir}/{container}/{container}__{folder}.attribs"
    attribs_dict = load_attributes(filename)

    # The number of records for the above sources must match.
    if len(uris_dict) != len(metadata_dict):
        print("Number of records between uris and metadata don't match!")
        sys.exit(1)

    if len(uris_dict) != len(attribs_dict):
        print("Number of records between uris and attributes don't match!")
        sys.exit(1)

    count_inserted = 0
    count_upd1 = 0 # counter for size, syn, vtt and pp
    count_upd2 = 0 # counter for uris, attribs and extradata
    count_upd3 = 0 # counter for embeddings
    count_upd4 = 0 # counter for owner_id and owner_name
    count_upd5 = 0 # counter for group_id and group_name
    count = 0
    captions_dir = os.path.join(data_dir,f"{container}/{folder}")
    for media_file, uri in uris_dict.items():
        basename, extension = os.path.splitext(media_file)

        # Check if the file records already exists
        record = get_file(conn, f"/{path_name}/", media_file)

        if record is None:
            # Get the media type based on the file extension
            media_type = 'video' 
            if media_file.endswith(('.mp4','.mov')):
               media_type = 'video'
            elif media_file.endswith(('.mp3','.wav')):
               media_type = 'audio'
            elif media_file.endswith(('.jpg','.jpeg','.png')):
               media_type = 'photo'
            elif media_file.endswith(('.pdf','.doc','docx','.xls','.xlsx','.ppt','.pptx')):
               media_type = 'document'
            else:
               media_type = 'unknown'

            # Insert a new record in the mbox_file table
            print(f"Adding {path_name}/{media_file} ...")
            file_id = add_media(conn, folder, folder_id, media_file, media_type)
            count_inserted += 1
        else:
            file_id = record[0]
            media_type = record[3]

        # Read contents of .syn file
        syn_file_path = os.path.join(captions_dir, f"{basename}.syn")
        with open(syn_file_path, 'r', encoding='utf-8') as syn_file:
            syn_content = syn_file.read()

        # Read contents of .vtt file
        vtt_file_path = os.path.join(captions_dir, f"{basename}.vtt")
        with open(vtt_file_path, 'r', encoding='utf-8') as vtt_file:
            vtt_content = vtt_file.read()

        # Read contents of .pp file
        pp_file_path = os.path.join(captions_dir, f"{basename}.pp")
        with open(pp_file_path, 'r', encoding='utf-8') as pp_file:
            pp_content = json.load(pp_file)
            people = pp_content['people']
            places = pp_content['places']

        # Read contents of .emb file
        emb_file_path = os.path.join(captions_dir, f"{basename}.emb")
        with open(emb_file_path, 'r', encoding='utf-8') as emb_file:
            emb_content = json.load(emb_file)
            chunks = emb_content.get('chunks',[])

        # Read the contents of the .offsets file
        if media_type == 'video':
            off_file_path = os.path.join(captions_dir, f"{basename}.offsets")
            with open(off_file_path, 'r', encoding='utf-8') as off_file:
                offsets = json.load(off_file)

        # Get the file size of the video/audio/photo/document
        id = media_file
        file_size = attribs_dict[id]['file_size']

        # Update the database with size/syn/vtt/pp
        if are_columns_empty(conn, file_id, ['description','webvtt','people','places']):
            print(f"Updating {path_name}/{media_file} with size/syn/vtt/pp data ...")
            count_upd1 += update_media1(conn, file_id, file_size, syn_content, vtt_content, people, places)
        else:
            print(f"Skipping {path_name}/{media_file} for size/syn/vtt/pp data ...")

        # Update the database with uris/metadata/attribs
        if are_columns_empty(conn, file_id, ['file_url','attributes','extra_data']):
            print(f"Updating {path_name}/{media_file} with uri/attribs/metadata ...")
            count_upd2 += update_media2(conn, file_id, uris_dict[id], attribs_dict[id], metadata_dict[id])
        else:
            print(f"Skipping {path_name}/{media_file} for uri/attribs/metadata ...")

        # Update the database with transcript embeddings
        if not has_embeddings(conn, file_id): 
            print(f"Inserting transcript embeddings for {path_name}/{media_file} ...")
            insert_embeddings(conn, file_id, chunks)
            if media_type == 'video':
                thumbnail = get_thumbnail(conn, container, folder)
                if thumbnail is None:
                    thumbnail_id = insert_dat(conn, file_id, container, folder)
                else:
                    thumbnail_id = thumbnail[0]
                update_offsets(conn, thumbnail_id, file_id, offsets)
            count_upd3 += 1
        else:
            print(f"Skipping transcript embeddings for {path_name}/{media_file} ...")

        # Update the database owner and group
        count_upd4 += update_file_owner(conn, file_id, owner_id, owner_name)
        count_upd5 += update_file_group(conn, file_id, group_id, group_name)

        count += 1

    print(f"{count} total records. {count_inserted} inserted. " \
          f"{count_upd1}/{count_upd2}/{count_upd3}/{count_upd4}/{count_upd5} updated.")


if __name__ == "__main__":
    # Set up argument parsing
    parser = argparse.ArgumentParser(description="Upload metadata to mbox database.")
    parser.add_argument("data_dir", help="Directory where the container/bucket folder is.")
    parser.add_argument("bucket", help="AWS S3 bucket name where asset folders are.")
    parser.add_argument("folder", help="AWS S3 bucket folder where assets are stored.")
    parser.add_argument("--owner", type=str, default=DEFAULT_OWNER_NAME, help="Owner name assigned to new assets.")
    parser.add_argument("--group", type=str, default=DEFAULT_GROUP_NAME, help="Group name assigned to new assets.")

    args = parser.parse_args()

    if not os.path.isdir(args.data_dir):
        print(f"The path {data_dir} is not a valid directory.")
        sys.exit(1)

    params = get_db_config()
    conn = psycopg2.connect(**params)

    upload_to_db(conn, args.data_dir, args.bucket, args.folder, args.owner, args.group)

    conn.commit()
    conn.close()

