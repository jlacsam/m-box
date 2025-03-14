import os
import sys
import psycopg2
import numpy as np
import argparse
import configparser
import json
import shutil
import logging

from logging.handlers import RotatingFileHandler

# Module-wide logger variable
logger = None
SHARPNESS = 30
SIMILARITY_THRESHOLD = 0.75

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
    console_handler.setStream(open(sys.stdout.fileno(), mode='w', buffering=1))
    console_handler.setLevel(logging.DEBUG)
    logger.addHandler(console_handler)
    return logger

# Function to get database connection parameters
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

# Function to determine if a face is a better representation
def is_better_representation(current_quality, current_pose, new_quality, new_pose):
    current_sharpness = current_quality['Sharpness']
    new_sharpness = new_quality['Sharpness']
    
    if current_sharpness >= SHARPNESS and new_sharpness >= SHARPNESS:
        current_directness = abs(current_pose['Roll']) + abs(current_pose['Yaw']) + abs(current_pose['Pitch'])
        new_directness = abs(new_pose['Roll']) + abs(new_pose['Yaw']) + abs(new_pose['Pitch'])
        return new_directness < current_directness
    else:
        return new_sharpness > current_sharpness


def link_merged_faces(conn):
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE mbox_face f1
        SET person_id = (
            SELECT f2.person_id FROM mbox_face f2 WHERE f1.merged_to = f2.face_id
        )
        WHERE f1.merged_to IS NOT NULL AND f1.person_id IS NULL; 
    """)
    affected = cursor.rowcount
    cursor.close()
    return affected

def match_persons(conn, threshold=SIMILARITY_THRESHOLD):
    # Match face records that aren't already matched with persons
    cursor = conn.cursor()
    cursor.execute("""
                   UPDATE mbox_face f
                   SET person_id = (SELECT person_id
                                    FROM mbox_person p
                                    WHERE (p.face <=> f.embedding) < (1.0 - %s)
                                    ORDER BY (p.face <=> f.embedding) ASC
                                    LIMIT 1)
                   WHERE f.person_id IS NULL
                   """, (threshold,))
    affected = cursor.rowcount
    cursor.close()
    return affected


def get_last_person_id(conn):
    with conn.cursor() as cursor:
        cursor.execute("SELECT max(person_id) FROM mbox_person")
        person_id = cursor.fetchone()[0]
        return person_id if person_id else 0


# Main function to populate mbox_person table
def identify_persons(conn, threshold=SIMILARITY_THRESHOLD):
    cursor = conn.cursor()

    # Fetch faces with null person_id and merged_to is null as well
    cursor.execute("""
                   SELECT face_id, file_id, embedding, box, pose, quality, gender, age_range, confidence 
                   FROM mbox_face 
                   WHERE person_id IS NULL AND merged_to IS NULL
                   """)
    faces = cursor.fetchall()

    count = 0
    face_count = 0
    for face in faces:
        face_id, file_id, embedding, box, pose, quality, gender, age_range, confidence = face
        embedding = np.array(embedding).tolist()

        # Check for matching person in mbox_person table using pgvector for similarity search
        cursor.execute("""
            SELECT person_id, person_uuid, file_id, face, box, pose, quality, 1.0 - (face <=> %s) AS similarity
            FROM mbox_person
            WHERE (face <=> %s) < (1.0 - %s)
            ORDER BY similarity DESC
            LIMIT 1
        """, (embedding,embedding,threshold))
        
        result = cursor.fetchone()
        similarity = 1.0

        if result is None:
            cursor.execute("""
                INSERT INTO mbox_person (full_name, face, box, pose, quality, gender, age_range, confidence, face_id, file_id) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING person_id
            """, ('Unknown', embedding, json.dumps(box), json.dumps(pose), json.dumps(quality), json.dumps(gender), json.dumps(age_range), confidence, face_id, file_id))
            person_id = cursor.fetchone()[0]

            cursor.execute("SELECT person_uuid FROM mbox_person WHERE person_id = %s", (person_id,))
            person_uuid = cursor.fetchone()[0]
            count = count + 1
        else:
            person_id, person_uuid, person_file_id, person_face, person_box, person_pose, person_quality, similarity = result
            if person_file_id == file_id:
                if is_better_representation(person_quality, person_pose, quality, pose):
                    cursor.execute("""
                        UPDATE mbox_person SET face = %s, box = %s, pose = %s, quality = %s, gender = %s, age_range = %s, confidence = %s, face_id = %s WHERE person_id = %s
                    """, (embedding, json.dumps(box), json.dumps(pose), json.dumps(quality), json.dumps(gender), json.dumps(age_range), confidence, face_id, person_id))

        cursor.execute("UPDATE mbox_face SET person_id = %s, person_uuid = %s, similarity = %s WHERE face_id = %s", (person_id, person_uuid, similarity, face_id))
        face_count += 1
        print(f"{face_count} of {len(faces)} faces:{100.0*face_count/len(faces):.2f}% complete: {count} new persons found.", end='\r')

    cursor.close()
    logger.info(f"{count} unique persons identified.")


# Setup logger outside main so that logs are created even when only the functions are called.
logger = setup_logger('logs','identify_persons','facebox.log')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Populate mbox_person table with unique faces.')
    parser.add_argument('--threshold', type=float, default=SIMILARITY_THRESHOLD, help=f'Threshold for similarity matching (default: {SIMILARITY_THRESHOLD})')
    args = parser.parse_args()
    
    # Shout out for this process
    logger.info("*********************************************************************************")
    logger.info("* IDENTIFY PERSONS **************************************************************")
    logger.info("*********************************************************************************")

    params = get_db_config()
    conn = psycopg2.connect(**params)

    # Print the last person_id before doing anything
    logger.info("Getting the last person_id in the database before adding any new records ...")
    last_person_id = get_last_person_id(conn)
    logger.info(f"The last person_id in the database is {last_person_id}")

    # Do a batch matching first
    logger.info("Performing a batch merge via database query (this may take 3 - 5 minutes.) ... ")
    match_persons(conn, args.threshold)
    conn.commit()
    logger.info("done.")

    # Match one record at a time and populating the persons table
    logger.info("Matching one face record at a time ... ")
    identify_persons(conn, args.threshold)
    conn.commit()
    logger.info("done.")

    # Link the already-merged faces
    logger.info("Link the already merged faces whose person_ids are still null ... ")
    link_merged_faces(conn)
    conn.commit()
    logger.info("done.")

    # Print the last person_id after processing
    logger.info("Getting the last person_id in the database after adding new records ...")
    last_person_id = get_last_person_id(conn)
    logger.info(f"The last person_id in the database is {last_person_id}")

    print("At the end of this process, we expect that there are no more face records where person_id is null.")
    print("If not, run it again.")

    conn.close()

