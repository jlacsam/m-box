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


def insert_folder(cursor, folder_data, parent_id=None):
    folder_data = folder_data.copy()
    subfolders = folder_data.pop('subfolders', [])
    files = folder_data.pop('files', [])
    folder_data.pop('folder_id', None)  # Remove folder_id as it will be auto-generated
    folder_data['parent_id'] = parent_id
    folder_data = {k: adapt_dict(v) for k, v in folder_data.items()}

    columns = ', '.join(folder_data.keys())
    values = ', '.join(['%s'] * len(folder_data))
    
    cursor.execute(f"""
        INSERT INTO mbox_folder ({columns})
        VALUES ({values})
        RETURNING folder_id
    """, list(folder_data.values()))
    
    new_folder_id = cursor.fetchone()[0]

    for subfolder in subfolders:
        insert_folder(cursor, subfolder, new_folder_id)

    for file in files:
        insert_file(cursor, file, new_folder_id)

    return new_folder_id


def insert_file(cursor, file_data, folder_id):
    file_data = file_data.copy()
    faces = file_data.pop('faces', [])
    voices = file_data.pop('voices', [])
    file_data.pop('file_id', None)  # Remove file_id as it will be auto-generated
    file_data.pop('search_text', None) # Remove search_text as it will also be auto-generated
    file_data['folder_id'] = folder_id
    file_data = {k: adapt_dict(v) for k, v in file_data.items()}

    columns = ', '.join(file_data.keys())
    values = ', '.join(['%s'] * len(file_data))
    
    cursor.execute(f"""
        INSERT INTO mbox_file ({columns})
        VALUES ({values})
        RETURNING file_id
    """, list(file_data.values()))
    
    new_file_id = cursor.fetchone()[0]

    for face in faces:
        insert_face(cursor, face, new_file_id)

    for voice in voices:
        insert_voice(cursor, voice, new_file_id)

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


def configure_thumbnails(cursor, bucket_name, folder_name, folder_id, faces_dat):
    # Get the media root
    media_root = os.environ.get('MBOX_MEDIA_ROOT')
    if not media_root:
        media_root = '/mbox/thumbnails/'

    # Create record for the face thumbnails
    label = f"{bucket_name}__{folder_name}__faces"
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


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(f"Usage: python {sys.argv[0]} <parent_id> <input_json> <faces dat>")
        print("This program will import the folders, files, faces and voices into the database.")
        print("<parent_id> is the folder_id of where to attach the folder tree.")
        print("<input_json> is the output of export_db.py, its filename must be <bucket>__<folder>.json")
        print("<faces_dat> is the dat file containing the faces thumbnails.")
        sys.exit(1)

    parent_id = sys.argv[1]
    input_file = sys.argv[2]
    faces_dat = sys.argv[3]

    # Check if the files exist
    if not os.path.exists(input_file):
        print(f"{input_file} not found.")
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

    new_folder_id = insert_folder(cursor, data, parent_id)
    print(f"Data imported successfully from {input_file}")

    filename = os.path.splitext(os.path.basename(input_file))[0]
    bucket_name, folder_name = filename.split('__')
    configure_thumbnails(cursor, bucket_name, folder_name, new_folder_id, faces_dat)

    cursor.close()
    conn.commit()
    conn.close()

