import sys
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

def insert_folder(cursor, folder_data, parent_id=None):
    folder_data = folder_data.copy()
    subfolders = folder_data.pop('subfolders', [])
    files = folder_data.pop('files', [])
    folder_data.pop('folder_id', None)  # Remove folder_id as it will be auto-generated
    folder_data['parent_id'] = parent_id

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

def insert_file(cursor, file_data, folder_id):
    file_data = file_data.copy()
    faces = file_data.pop('faces', [])
    voices = file_data.pop('voices', [])
    file_data.pop('file_id', None)  # Remove file_id as it will be auto-generated
    file_data.pop('search_text', None) # Remove search_text as it will also be auto-generated
    file_data['folder_id'] = folder_id

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
    face_data['file_id'] = file_id

    columns = ', '.join(face_data.keys())
    values = ', '.join(['%s'] * len(face_data))
    
    cursor.execute(f"""
        INSERT INTO mbox_face ({columns})
        VALUES ({values})
    """, list(face_data.values()))

def insert_voice(cursor, voice_data, file_id):
    voice_data = voice_data.copy()
    voice_data.pop('voice_id', None)  # Remove voice_id as it will be auto-generated
    voice_data['file_id'] = file_id

    columns = ', '.join(voice_data.keys())
    values = ', '.join(['%s'] * len(voice_data))
    
    cursor.execute(f"""
        INSERT INTO mbox_voice ({columns})
        VALUES ({values})
    """, list(voice_data.values()))

def import_from_json(conn, input_file, parent_id):
    with open(input_file, 'r') as f:
        data = json.load(f)

    cursor = conn.cursor()

    try:
        insert_folder(cursor, data, parent_id)
        conn.commit()
        print(f"Data imported successfully from {input_file}")
    except Exception as e:
        conn.rollback()
        print(f"An error occurred: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} <parent_id> <input_json>")
        print("This program will import the folders, files, faces and voices into the database.")
        print("<parent_id> is the folder_id of where to attach the folder tree.")
        sys.exit(1)

    parent_id = sys.argv[1]
    input_file = sys.argv[2]
    params = get_db_config()
    conn = psycopg2.connect(**params)

    import_from_json(conn, input_file, parent_id)

