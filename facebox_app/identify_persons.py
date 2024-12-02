import psycopg2
import numpy as np
import argparse
import configparser
import json
import shutil

SHARPNESS = 30

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

# Main function to populate mbox_person table
def identify_persons(conn, threshold=0.70):
    cursor = conn.cursor()

    # Fetch faces with null person_id
    cursor.execute("SELECT face_id, file_id, embedding, box, pose, quality, gender, age_range, confidence FROM mbox_face WHERE person_id IS NULL")
    faces = cursor.fetchall()

    count = 0
    face_count = 0
    for face in faces:
        face_id, file_id, embedding, box, pose, quality, gender, age_range, confidence = face
        embedding = np.array(embedding).tolist()

        # Check for matching person in mbox_person table using pgvector for similarity search
        cursor.execute("""
            SELECT person_id, file_id, face, box, pose, quality, 1.0 - (face <=> %s) AS similarity
            FROM mbox_person
            WHERE (1.0 - (face <=> %s)) > %s
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
            count = count + 1
        else:
            person_id, person_file_id, person_face, person_box, person_pose, person_quality, similarity = result
            if person_file_id == file_id:
                if is_better_representation(person_quality, person_pose, quality, pose):
                    cursor.execute("""
                        UPDATE mbox_person SET face = %s, box = %s, pose = %s, quality = %s, gender = %s, age_range = %s, confidence = %s, face_id = %s WHERE person_id = %s
                    """, (embedding, json.dumps(box), json.dumps(pose), json.dumps(quality), json.dumps(gender), json.dumps(age_range), confidence, face_id, person_id))

        cursor.execute("UPDATE mbox_face SET person_id = %s, similarity = %s WHERE face_id = %s", (person_id, similarity, face_id))
        face_count += 1
        print(f"{100.0*face_count/len(faces):.2f}% complete.", end='\r')

    cursor.close()
    print(f"{count} unique persons identified.")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Populate mbox_person table with unique faces.')
    parser.add_argument('--threshold', type=float, default=0.70, help='Threshold for similarity matching (default: 0.70)')
    args = parser.parse_args()
    
    params = get_db_config()
    conn = psycopg2.connect(**params)

    identify_persons(conn,args.threshold)

    conn.commit()
    conn.close()

