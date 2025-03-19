import os
import numpy as np
import librosa
import io
import configparser
import boto3
import magic

from functools import wraps
from keras_facenet import FaceNet
from mtcnn import MTCNN
from PIL import Image
from pydub import AudioSegment
from .models import MboxFile, MboxFolder, MboxAudit

from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.conf import settings

from rest_framework.response import Response
from rest_framework import status

# Libraries needed for text embedding
import tensorflow as tf
import tensorflow_hub as hub
import tensorflow_text

# Initialize the FaceNet model and the MTCNN detector
facenet = FaceNet()
detector = MTCNN()
USE_CMLM = hub.load(os.environ.get('USE_CMLM_HOME'))

def preprocess_image(image):
    """
    Preprocess the image for FaceNet model
    :param image: PIL Image
    :return: preprocessed image
    """
    image = image.resize((160, 160))  # Resize image to the required size (160x160)
    image = np.asarray(image)  # Convert to numpy array
    image = image.astype('float32')  # Convert to float32
    mean, std = image.mean(), image.std()
    image = (image - mean) / std  # Standardize
    image = np.expand_dims(image, axis=0)  # Add batch dimension
    return image

def extract_face(image):
    """
    Detects and extracts the face from the image using MTCNN
    :param image: PIL Image
    :return: cropped face as PIL Image, bounding box
    """
    image_np = np.asarray(image)
    results = detector.detect_faces(image_np)
    if len(results) == 0:
        raise ValueError("No faces detected in the image")
    if len(results) > 1:
        raise ValueError("Multiple faces detected in the image")
    
    # Extract bounding box and face
    bounding_box = results[0]['box']
    x, y, width, height = bounding_box
    face = image.crop((x, y, x + width, y + height))
    return face, bounding_box

def get_face_embedding(image_bytes):
    """
    Generate face embedding for a given image
    :param image_bytes: image in bytes format
    :return: face embedding, bounding box
    """
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    face, bounding_box = extract_face(image)
    preprocessed_face = np.expand_dims(np.array(face), axis=0)  # Prepare face for FaceNet embeddings
    embedding = facenet.embeddings(preprocessed_face)
    return embedding.flatten(), bounding_box

def get_voice_embedding(audio_segment):
    """ 
    Convert pydub AudioSegment to numpy array
    Normalize the samples, extract MFCCs, 
    Take the mean of each MFCC coefficient,
    Normalize the embedding
    """
    samples = np.array(audio_segment.get_array_of_samples()).astype(np.float32)
    samples = samples / np.max(np.abs(samples))
    mfccs = librosa.feature.mfcc(y=samples, sr=audio_segment.frame_rate, n_mfcc=13)
    mfcc_embedding = np.mean(mfccs, axis=1)
    mfcc_embedding_normalized = mfcc_embedding / np.linalg.norm(mfcc_embedding)

    return mfcc_embedding_normalized.tolist()

def get_text_embedding(text):
    return USE_CMLM([text]).numpy()[0]

def validate_subscription(subscription_id, client_secret):
    """
    Validates the subscription ID and client secret
    :param subscription_id: subscription ID
    :param client_secret: client secret key
    :return: boolean indicating if the credentials are valid
    """
    # Implement your subscription validation logic here
    valid_subscription_ids = {"00000000": "00000000"}
    return valid_subscription_ids.get(subscription_id) == client_secret

def tuples_to_json(tuples,labels):
    if len(labels) != len(tuples[0]):
        print("Unequal labels and tuples!",labels,"\n",tuples[0])
        raise ValueError("Number of labels must match the number of elements in a tuple.")

    dict_list = []
    for item in tuples:
        dict_item = dict(zip(labels, item))
        dict_list.append(dict_item)

    return dict_list

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

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

# Check Folder Permissions #####################################################
def check_folder_permission(request,folder_id,action):
    folder = get_object_or_404(MboxFolder, folder_id=folder_id)
    user = request.user
    groups = request.user.groups.all()

    if not user:
        return False

    if action == 'list': # List the contents of the folder
        if folder.public_rights & 4 and folder.public_rights & 1: # r-x : list filenames and details
            return True
        if user: # User exists in the domain
            if folder.domain_rights & 4 and folder.domain_rights & 1:
                return True
        if groups:
            if groups.filter(name=folder.group_name).exists():
                if folder.group_rights & 4 and folder.group_rights & 1:
                    return True
        if folder.owner_name:
            if folder.owner_name.lower() == user.username.lower():
                if folder.owner_rights & 4 and folder.owner_rights & 1:
                    return True
        if user.is_superuser:
            if folder.owner_rights & 4 and folder.owner_rights & 1:
                return True

    if action in [ 'update', 'rename', 'add' ]: # Update metadata, rename or add folder/file
        if folder.public_rights & 2 and folder.public_rights & 1: # -wx
            return True
        if user: # User exists in the domain
            if folder.domain_rights & 2 and folder.domain_rights & 1:
                return True
        if groups:
            if groups.filter(name=folder.group_name).exists():
                if folder.group_rights & 2 and folder.group_rights & 1:
                    return True
        if folder.owner_name:
            if folder.owner_name.lower() == user.username.lower():
                if folder.owner_rights & 2 and folder.owner_rights & 1:
                    return True
        if user.is_superuser:
            if folder.owner_rights & 2 and folder.owner_rights & 1:
                return True

    if action in [ 'delete', 'restore' ]: # Delete or restore the folder
        parent = get_object_or_404(MboxFolder, folder_id=folder.parent_id)
        if parent.public_rights & 2 and parent.public_rights & 1 and \
            folder.public_rights & 2 and folder.public_rights & 1: # -wx
            return True
        if user: # User exists in the domain
            if parent.domain_rights & 2 and parent.domain_rights & 1 and \
                folder.domain_rights & 2 and folder.domain_rights & 1: # -wx
                return True
        if groups:
            if groups.filter(name=parent.group_name).exists():
                if parent.group_rights & 2 and parent.group_rights & 1 and \
                    folder.group_rights & 2 and folder.group_rights & 1: # -wx
                    return True
        if parent.owner_name:
            if parent.owner_name.lower() == user.username.lower():
                if parent.owner_rights & 2 and parent.owner_rights & 1 and \
                    folder.owner_rights & 2 and folder.owner_rights & 1: # -wx
                    return True
        if user.is_superuser:
            if parent.owner_rights & 2 and parent.owner_rights & 1 and \
                folder.owner_rights & 2 and folder.owner_rights & 1: # -wx
                return True

    if action in [ 'set_owner', 'set_group', 'set_permission' ]:
        if folder.owner_name:
            if folder.owner_name.lower() == user.username.lower():
                return True
        if user.is_superuser:
            return True

    if action in [ 'set_tree_owner', 'set_tree_group', 'set_tree_permission']:
        if user.is_superuser:
            return True

    return False

# Check File Permissions #####################################################
def check_file_permission(request,file_id,action):
    file = get_object_or_404(MboxFile, file_id=file_id)
    folder = get_object_or_404(MboxFolder, folder_id=file.folder_id)
    user = request.user
    groups = request.user.groups.all()

    if not user:
        return False

    # Unix systems require execute permission on the entire tree but
    # we will relax that rule. Execute permission on the parent is enough.
    has_execute = False
    if folder.public_rights & 1: # --x
        has_execute = True
    if user: # User exists in the domain
        if folder.domain_rights & 1:
            has_execute = True
    if groups:
        if groups.filter(name=folder.group_name).exists():
            if folder.group_rights & 1:
                has_execute = True
    if folder.owner_name:
        if folder.owner_name.lower() == user.username.lower():
            if folder.owner_rights & 1:
                has_execute = True
    if user.is_superuser:
        if folder.owner_rights & 1:
            has_execute = True

    if not has_execute:
        return False

    if action == 'download':
        if file.public_rights & 4: # r--
            return True
        if user: # User exists in the domain
            if file.domain_rights & 4:
                return True
        if groups:
            if groups.filter(name=file.group_name).exists():
                if file.group_rights & 4:
                    return True
        if file.owner_name:
            if file.owner_name.lower() == user.username.lower():
                if file.owner_rights & 4:
                    return True
        if user.is_superuser:
            if file.owner_rights & 4:
                return True

    if action == 'update' or action == 'rename':
        if file.public_rights & 2: # -w-
            return True
        if user: # User exists in the domain
            if file.domain_rights & 2:
                return True
        if groups:
            if groups.filter(name=file.group_name).exists():
                if file.group_rights & 2:
                    return True
        if file.owner_name:
            if file.owner_name.lower() == user.username.lower():
                if file.owner_rights & 2:
                    return True
        if user.is_superuser:
            if file.owner_rights & 2:
                return True

    if action == 'delete' or action == 'restore':
        if folder.public_rights & 2: # -w-
            return True
        if user:
            if folder.domain_rights & 2:
                return True
        if groups:
            if groups.filter(name=folder.group_name).exists():
                if folder.group_rights & 2:
                    return True
        if folder.owner_name:
            if folder.owner_name.lower() == user.username.lower():
                if folder.owner_rights & 2:
                    return True
        if user.is_superuser:
            if folder.owner_rights & 2:
                return True

    if action in [ 'set_owner', 'set_group', 'set_permission' ]:
        if file.owner_name:
            if file.owner_name.lower() == user.username.lower():
                return True
        if user.is_superuser:
            return True

    return False


# Insert audit record ##############################################################################
def insert_audit(username,activity,table_name,record_id,old_data,new_data,location):
    try:
        audit = MboxAudit(
            username = username,
            activity = activity,
            table_name = table_name,
            record_id = record_id,
            old_data = old_data,
            new_data = new_data,
            location = location
        )

        audit.save()
    except Exception as e:
        print(f"Error occurred: {e}")


# Update last accessed of either folder or file record #############################################
def update_last_accessed(record_id,target='file'):
    try:
        if target == 'folder':
            row = get_object_or_404(MboxFolder, folder_id=record_id)
        else:
            row = get_object_or_404(MboxFile, file_id=record_id)
        row.last_accessed = timezone.now()
        row.save()
    except Exception as e:
        print(f"Error occurred: {e}")


# Update last modified of either folder or file record #############################################
def update_last_modified(record_id,target='file'):
    try:
        if target == 'folder':
            row = get_object_or_404(MboxFolder, folder_id=record_id)
        else:
            row = get_object_or_404(MboxFile, file_id=record_id)
        row.last_modified = timezone.now()
        row.save()
    except Exception as e:
        print(f"Error occurred: {e}")


# Validate subscription ID and client secret decorator #############################################
def validate_subscription_headers(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        # Extract subscription headers
        subscription_id = request.headers.get('Subscription-ID')
        client_secret = request.headers.get('Client-Secret')

        # Check if required headers are present
        if not subscription_id or not client_secret:
            return Response(
                {
                    'error': 'Missing required headers: Subscription-ID and/or Client-Secret'
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Validate the subscription
        if not validate_subscription(subscription_id, client_secret):
            return Response(
                {
                    'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        # If validation passes, proceed with the view function
        return view_func(request, *args, **kwargs)

    return wrapper


# Override file_url with mbox url to prevent direct user access to the media assets ################
def override_file_url(records, labels):
    try:
        file_id_index = labels.index('file_id')
        file_url_index = labels.index('file_url')

        # Convert records to a list of lists if it contains tuples
        temp_records = [list(record) for record in records]

        for record in temp_records:
            file_id = record[file_id_index]
            record[file_url_index] = f"/api/get-presigned-url/{file_id}/"

        # Convert back to tuples if needed
        results = [tuple(record) for record in temp_records]
        return results

    except ValueError:
        print("WARNING: Unable to replace AWS S3/Azure Blob Storage URLs with m-box URLs.")
        return records


# Update text embedding ############################################################################
def update_text_embedding(file_id, source, time_range, new_text, old_text=None):
    if source == 'S': # Synopsis
        embedding = get_text_embedding(new_text)
        query = """
                UPDATE mbox_transcript SET chunk = %s, embedding = %s::vector
                WHERE file_id = %s AND source = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (new_text.strip(), embedding.tolist(), file_id, source))
            return cursor.rowcount

    elif source == 'T': # Transcript
        time_start_str, time_end_str = map(str.strip, time_range.split('-->'))

        def time_to_seconds(time_str):
            hours, minutes, seconds = map(float, time_str.split(':'))
            return hours * 3600 + minutes * 60 + seconds

        # Add some fudge to account for floating point variations when moving data around
        time_start = time_to_seconds(time_start_str) + (1.0/60.0) 
        time_end = time_to_seconds(time_end_str) - (1.0/60.0)

        # Get the old chunk
        query = """
                SELECT chunk_id, chunk, source, time_start, time_end
                FROM mbox_transcript 
                WHERE file_id = %s
                      AND source = 'T'
                      AND time_start <= %s
                      AND time_end >= %s
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (file_id, time_start, time_end))
            chunk = cursor.fetchone()
            if chunk is None:
                print(f"Unable to find a chunk in file {file_id} that encloses {time_start} and {time_end}.")
                return 0

        chunk_id = chunk[0]
        old_chunk = chunk[1]

        # Check if the old text is within the chunk
        if old_chunk.find(old_text) < 0:
            return 0

        new_chunk = old_chunk.replace(old_text, new_text)
        embedding = get_text_embedding(new_chunk)

        query = """
                UPDATE mbox_transcript SET chunk = %s, embedding = %s::vector
                WHERE chunk_id = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (new_chunk, embedding.tolist(), chunk_id))
            return cursor.rowcount

# Upload temporary file from temporary storage to permanent storage ################################
def upload_to_storage(file_id, temp_file):

    # TO DO: Implement some kind of queuing and upload files asynchronously

    target = settings.TARGET_STORAGE
    if target == 's3':
        upload_to_s3(file_id, temp_file)
    elif target == 'azure':
        upload_to_azure(file_id, temp_file)
    elif target == 'local':
        upload_to_local(file_id, temp_file)
    else:
        upload_to_local(file_id, temp_file)

# Upload temporary file to S3 ######################################################################
def upload_to_s3(file_id, temp_file):
    try:
        # Get the file record
        file_obj = MboxFile.objects.get(file_id=file_id)

        # Configure S3 client
        s3_client = boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_DEFAULT_REGION
        )

        # Upload to S3
        max_files = int(getattr(settings, 'MAX_FILES_PER_STORAGE_BUCKET', 1000))
        bucket_name = settings.AWS_STORAGE_BUCKET_NAME
        folder = f'{(file_id // max_files):04X}'
        file_name = f'{file_id:08X}__{file_obj.name}'
        storage_key = f'{folder}/{file_name}'

        mime = magic.Magic(mime=True)
        content_type = mime.from_file(temp_file)
        s3_client.upload_file(temp_file, bucket_name, storage_key, ExtraArgs={ 'ContentType': content_type })

        # Update record with S3 info
        file_obj.storage_key = 's3://' + bucket_name + '/' + storage_key
        file_obj.status = 'uploaded'
        file_obj.disabled = False
        file_obj.save()

    except Exception as e:
        # Handle error
        if file_obj:
            file_obj.status = 'upload failed'
            file_obj.remarks = str(e)
            file_obj.disabled = True
            file_obj.save()

    # Remove the local file
    if getattr(settings, 'DELETE_LOCAL_FILE_AFTER_UPLOAD', True):
        os.remove(temp_file)

# Upload temporary file to Azure Blob Storage ######################################################
def upload_to_azure(file_id, temp_file):
    print('This function is not yet implemented.')

# Upload temporary file to Local Storage ###########################################################
def upload_to_local(file_id, temp_file):
    file_obj = None
    try:
        # Get the file size
        file_size = os.get_size(temp_file)

        # Get the storage blob that is least full.
        query = """
            SELECT blob_id, blob_path, (capacity-used) AS remaining 
            FROM mbox_blob 
            WHERE remaining > 0 
            ORDER BY remaining DESC
            LIMIT 1
        """
        with connection.cursor() as cursor:
            cursor.execute(query)
            blob = cursor.fetchone()

        # If there is no such storage, create a new one
        if blob is None:
            label = f'BLOB{int(time.time()):08X}'
            path = os.path.join(settings.BLOB_STORAGE, f'{label}.dat')
            query = "INSERT INTO mbox_blob (label,path) VALUES (%s,%s) RETURNING blob_id"
            with connection.cursor() as cursor:
                cursor.execute(query, (label, path))
                blob_id = cursor.fetchone()[0]
        else:
            blob_id = blob[0]
            path = blob[1]

        # Append the file to that new storage
        with open(temp_file, "rb") as infile:
            with open(path, "ab") as outfile:
                outfile.write(infile.read())
                offset = outfile.tell()

        # Store the offset in the file table
        file_obj = MboxFile.objects.get(file_id=file_id)
        file_obj.blob_offset = offset
        file_obj.status = 'uploaded'
        file_obj.disabled = False
        file_obj.save()

    except Exception as e:
        # Handle error
        if file_obj:
            file_obj.status = 'upload failed'
            file_obj.remarks = str(e)
            file_obj.disabled = True
            file_obj.save()

    # Optionally remove the local file
    if getattr(settings, 'DELETE_LOCAL_FILE_AFTER_UPLOAD', True):
        os.remove(temp_file)

