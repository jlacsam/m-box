import os
import sys
import configparser
import argparse
import json
import psycopg2


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


def import_from_json(conn, input_path):

    # Read the JSON file
    with open(input_path, 'r', encoding='utf-8') as f:
        records = json.load(f)
        
    cursor = conn.cursor()
    count = 0
    face_count = 0
    total_records = len(records)
        
    for record in records:
        # Remove person_id as it's a sequence, so is face_id
        record.pop('person_id', None)

        # Find the face_id that most similar
        person_uuid = record['person_uuid']
        face_vector = record['face']
        query = f"SELECT face_id FROM mbox_face WHERE person_uuid = %s ORDER BY embedding <=> %s::vector LIMIT 1"
        cursor.execute(query, (person_uuid, face_vector))
        face_id = cursor.fetchone()[0]
        record['face_id'] = face_id
            
        # Get the column names and values
        columns = list(record.keys())

        # Convert values, ensuring dictionaries are converted to JSON strings
        values = []
        for col in columns:
            val = record[col]
            if isinstance(val, dict):
                values.append(json.dumps(val))
            else:
                values.append(val)
 
        # Build the INSERT statement
        placeholders = ', '.join(['%s'] * len(columns))
        column_names = ', '.join(columns)
        query = f"INSERT INTO mbox_person ({column_names}) VALUES ({placeholders}) RETURNING person_id"
            
        # Execute the INSERT
        cursor.execute(query, values)
        person_id = cursor.fetchone()[0]

        # Update the linked face records
        query = "UPDATE mbox_face SET person_id = %s WHERE person_uuid = %s::uuid"
        cursor.execute(query, (person_id, person_uuid))
        face_count += cursor.rowcount

        # Print status updates
        count += 1
        print(f"{100.0 * count/total_records:.2f}% completed. {face_count} face_records updated.", end="\r")

    print(f"{100.0 * count/total_records:.2f}% completed. {face_count} face_records updated.")
    print(f"Successfully imported {count}/{total_records} records.")
    cursor.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Import JSON file into PostgreSQL table')
    parser.add_argument('input_path_file', help='Path/file to the input JSON file')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_path_file):
        print(f"Error: File {args.input_path} does not exist.")
        sys.exit(1)

    # PostgreSQL connection
    params = get_db_config()
    conn = psycopg2.connect(**params)
    
    import_from_json(conn,args.input_path_file)

    conn.commit()
    conn.close()
