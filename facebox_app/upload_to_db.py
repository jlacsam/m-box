import os
import sys
import csv
import json
import psycopg2
import configparser

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
        SELECT f.file_id, d.path_name, f.name
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

def add_media(conn, folder_id, filename, media_type):
    cursor = conn.cursor()
    extension = os.path.splitext(filename)[1]
    insert_query = """
        INSERT INTO mbox_file (folder_id,name,extension,media_type)
        VALUES (%s, %s, %s, %s) RETURNING file_id;
    """
    cursor.execute(insert_query, (folder_id, filename, extension, media_type))
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
        for row in reader:
            filename = row['filename']
            attribs_dict[filename] = {
                'filename': row['filename'],
                'length': row['length'],
                'audio_channels': row['audio_channels'],
                'audio_sample_rate': row['audio_sample_rate'],
                'video_resolution': row['video_resolution'],
                'frame_rate': row['frame_rate'],
                'file_size': row['file_size']
            }
    return attribs_dict

def upload_to_db(conn, data_dir, container, folder):
    """Processes all .json files in the specified directory."""
    folder_id = 0

    # Get/Create an mbox folder for this container/bucket
    mbox_container = get_folder(conn, container)
    if mbox_container is None:
        folder_id = create_folder(conn, container)
        mbox_container = get_folder(conn, container)

    # Get/Create an mbox folder for this folder/batch
    path_name = f"{container}/{folder}"
    mbox_folder = get_folder(conn, path_name)
    if mbox_folder is None:
        folder_id = create_folder(conn, folder, mbox_container)
        mbox_folder = get_folder(conn, path_name)

    # Load video uris, attribs & metadata
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
    count_updated = 0
    count = 0
    captions_dir = os.path.join(data_dir,f"{container}/{folder}")
    for media_file, uri in uris_dict.items():
        basename, extension = os.path.splitext(media_file)

        # Check if the file records already exists
        record = get_file(conn, f"/{path_name}/", media_file)

        if record is None:
            # Get the media type based on the file extension
            media_type = 'video' if media_file.endswith('mp4') else 'audio'

            # Insert a new record in the mbox_file table
            print(f"Adding {path_name}/{media_file} ...")
            file_id = add_media(conn, folder_id, media_file, media_type)
            count_inserted += 1
        else:
            file_id = record[0]
            count_updated += 1

        syn_file_path = os.path.join(captions_dir, f"{basename}.syn")
        vtt_file_path = os.path.join(captions_dir, f"{basename}.vtt")
        pp_file_path = os.path.join(captions_dir, f"{basename}.pp")

        # Read contents of .syn file
        with open(syn_file_path, 'r', encoding='utf-8') as syn_file:
            syn_content = syn_file.read()

        # Read contents of .vtt file
        with open(vtt_file_path, 'r', encoding='utf-8') as vtt_file:
            vtt_content = vtt_file.read()

        # Read contents of .pp file
        with open(pp_file_path, 'r', encoding='utf-8') as pp_file:
            pp_content = json.load(pp_file)
            people = pp_content['people']
            places = pp_content['places']

        # Get the file size of the video/audio
        id = media_file
        file_size = attribs_dict[id]['file_size']

        # Update the database with size/syn/vtt/pp
        print(f"Updating {path_name}/{media_file} with size/syn/vtt/pp data ...")
        count += update_media1(conn, file_id, file_size, syn_content, vtt_content, people, places)

        # Update the database with uris/metadata/attribs
        print(f"Updating {path_name}/{media_file} with uri/attribs/metadata ...")
        update_media2(conn, file_id, uris_dict[id], attribs_dict[id], metadata_dict[id])

    print(f"{count} total records.{count_inserted}  inserted. {count_updated} updated.")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: python {sys.argv[0]} <data directory> <container> <folder> <media filter>")
        print("<data directory>: Local directory where the <container> folder is.")
        print("<container>: Azure Blob Storage container containing the same set of videos/audios.")
        print("<folder>: Folder within the container where videos/audios are actually stored. ")
        sys.exit(1)

    data_dir = sys.argv[1]
    container = sys.argv[2]
    folder = sys.argv[3]

    if not os.path.isdir(data_dir):
        print(f"The path {data_dir} is not a valid directory.")
        sys.exit(1)

    params = get_db_config()
    conn = psycopg2.connect(**params)

    upload_to_db(conn, data_dir, container, folder)

    conn.commit()
    conn.close()

