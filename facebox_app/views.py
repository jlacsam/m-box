import os
import psycopg2
import json
import re
import struct
import io

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from django.db import connection
from django.conf import settings
from django.core.exceptions import FieldDoesNotExist
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse, HttpResponse, StreamingHttpResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required

from azure.storage.blob import BlobServiceClient

from .utils import get_face_embedding, get_voice_embedding, validate_subscription, tuples_to_json, get_client_ip, check_file_permission, insert_audit, update_last_accessed
from .models import FbxFace, FbxFile, FbxThumbnail, FbxFolder


# Search the mbox_face table ########################################################################
@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def search_face(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    similarity = request.headers.get('Similarity')
    max_rows = request.headers.get('Max-Rows')
    video_list = request.headers.get('Video-List')
    start_from = request.headers.get('Start-From')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if an image is provided
    if 'image' not in request.FILES:
        return Response({'error': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)
    
    image = request.FILES['image'].read()

    try:
        embedding, bounding_box = get_face_embedding(image)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # Process start from
    last_face_id = 0
    last_similarity = 1.0
    if start_from is not None:
        json_start_from = json.loads(start_from)
        last_face_id = json_start_from['face_id']
        last_similarity = json_start_from['similarity']

    # Search for matching records in the database
    labels = ['face_id','file_id','person_id','time_start','time_end','box','confidence',
        'merged_to','similarity','full_name','first_name','middle_name','last_name','file_name','file_url']
    rows = []
    query = """
        SELECT ff.face_id, ff.file_id, ff.person_id, ff.time_start, ff.time_end, ff.box, 
            ff.confidence, ff.merged_to, 1.0 - (embedding <=> %s::vector) AS similarity, 
            fp.full_name, fp.first_name, fp.middle_name, fp.last_name, fl.name AS file_name, fl.file_url
        FROM mbox_face ff, mbox_person fp, mbox_file fl
    """
    with connection.cursor() as cursor:
        if last_face_id == 0:
            query += """
                WHERE (embedding <=> %s::vector) <= (1.0 - %s) AND
                    ff.person_id = fp.person_id AND 
                    ff.file_id = fl.file_id AND
                    ff.merged_to IS NULL 
            """
        else:
            query += f"""
                WHERE (embedding <=> %s::vector) BETWEEN (1-{last_similarity}) AND (1.0 - %s) AND
                    ff.person_id = fp.person_id AND 
                    ff.file_id = fl.file_id AND
                    ff.file_id <> {last_face_id} AND
                    ff.merged_to IS NULL 
            """
        if video_list is not None and video_list != "0":
            query += f"AND ff.file_id in ({video_list}) "
        query += """
            ORDER BY similarity DESC
            LIMIT %s
        """

        cursor.execute(query, (embedding.tolist(),embedding.tolist(),similarity,max_rows))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get the faces linked to the given person #####################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_linked_faces(request,person_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    max_rows = request.headers.get('Max-Rows')
    start_from = request.headers.get('Start-From')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Process start from
    last_face_id = 0
    if start_from is not None:
        json_start_from = json.loads(start_from)
        last_face_id = json_start_from['face_id']

    # Get the embedding associated with the face
    query = """
        SELECT f.embedding 
        FROM mbox_person p JOIN mbox_face f ON p.face_id = f.face_id
        WHERE p.person_id = %s
    """

    cursor = connection.cursor()
    cursor.execute(query, (person_id,))
    row = cursor.fetchone()
    if row is None:
        return Response({'error':f'Invalid person_id: {person_id}, or no faces linked.'}, status=status.HTTP_400_BAD_REQUEST)

    embedding = json.loads(row[0])

    # Search for matching records in the database
    labels = ['face_id','file_id','person_id','time_start','time_end','box','confidence',
        'merged_to','similarity','full_name','first_name','middle_name','last_name','file_name','file_url']
    rows = []
    query = """
        SELECT ff.face_id, ff.file_id, ff.person_id, ff.time_start, ff.time_end, ff.box, 
            ff.confidence, ff.merged_to, 1.0 - (embedding <=> %s::vector) AS similarity, 
            fp.full_name, fp.first_name, fp.middle_name, fp.last_name, fl.name AS file_name, fl.file_url
        FROM mbox_face ff, mbox_person fp, mbox_file fl
        WHERE fp.person_id = %s AND
            ff.person_id = fp.person_id AND 
            ff.file_id = fl.file_id AND
            ff.face_id > %s AND
            ff.merged_to IS NULL 
        ORDER BY ff.face_id ASC
        LIMIT %s
    """

    cursor.execute(query, (embedding,person_id,last_face_id,max_rows))
    rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Search the mbox_voice table using an audio file ###################################################
@csrf_exempt
@permission_classes([IsAuthenticated])
@api_view(['POST'])
def search_voice(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    similarity = request.headers.get('Similarity')
    max_rows = request.headers.get('Max-Rows')
    media_list = request.headers.get('Media-List')
    start_from = request.headers.get('Start-From')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if an image is provided
    if 'audio' not in request.FILES:
        return Response({'error': 'No audio provided'}, status=status.HTTP_400_BAD_REQUEST)
    
    audio_file = request.FILES['audio']

    try:
        audio_data = audio_file.read()
        audio_bytes = AudioSegment.from_file(io.BytesIO(audio_data), format=audio_file.name.split('.')[-1])
        embedding = get_voice_embedding(audio_bytes)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # Process start from
    last_voice_id = 0
    last_similarity = 1.0
    if start_from is not None:
        json_start_from = json.loads(start_from)
        last_voice_id = json_start_from['voice_id']
        last_similarity = json_start_from['similarity']

    # Search for matching records in the database
    labels = ['voice_id','file_id','person_id','time_start','time_end',
        'similarity','full_name','first_name','middle_name','last_name','file_name','file_url']
    rows = []
    query = """
        SELECT fv.voice_id, fv.file_id, fv.person_id, fv.time_start, fv.time_end,  
            1.0 - (embedding <=> %s::vector) AS similarity, 
            fp.full_name, fp.first_name, fp.middle_name, fp.last_name, ff.name AS file_name, ff.file_url
        FROM mbox_voice fv, mbox_person fp, mbox_file ff
    """
    with connection.cursor() as cursor:
        if last_voice_id == 0:
            query += """
                WHERE (embedding <=> %s::vector) <= (1.0 - %s) AND
                    fv.person_id = fp.person_id AND 
                    fv.file_id = ff.file_id 
            """
        else:
            query += f"""
                WHERE (embedding <=> %s::vector) BETWEEN (1-{last_similarity}) AND (1.0 - %s) AND
                    fv.person_id = fp.person_id AND 
                    fv.file_id = ff.file_id AND
                    fv.file_id <> {last_voice_id} 
            """
        if media_list is not None and media_list != "0":
            query += f"AND fv.file_id in ({media_list}) "
        query += """
            ORDER BY similarity DESC
            LIMIT %s
        """
        cursor.execute(query, (embedding.tolist(),embedding.tolist(),similarity,max_rows))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


####################################################################################################
# Search the mbox_voice table using a reference to a segment from another audio file that is already 
# stored in the mbox_table and has records in the mbox_voice table
@csrf_exempt
@permission_classes([IsAuthenticated])
@api_view(['GET'])
def search_voice_by_ref(request,voice_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    similarity = request.headers.get('Similarity')
    max_rows = request.headers.get('Max-Rows')
    media_list = request.headers.get('Media-List')
    start_from = request.headers.get('Start-From')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Process start from
    last_voice_id = 0
    last_similarity = 1
    if start_from is not None:
        json_start_from = json.loads(start_from)
        last_voice_id = json_start_from['voice_id']
        last_similarity = json_start_from['similarity']

    # Search for matching records in the database
    labels = ['voice_id','file_id','speaker','person_id','time_start','time_end',
        'similarity','full_name','first_name','middle_name','last_name','file_name','file_url']
    rows = []
    query = """
        SELECT fv1.voice_id, fv1.file_id, fv1.speaker, fv1.person_id, fv1.time_start, fv1.time_end,  
            1.0 - (fv1.embedding <=> fv2.embedding) AS similarity, 
            fp.full_name, fp.first_name, fp.middle_name, fp.last_name, ff.name AS file_name, ff.file_url
        FROM mbox_voice fv1
    """
    with connection.cursor() as cursor:
        if last_voice_id == 0:
            query += f"""
                JOIN mbox_voice fv2 ON (fv1.embedding <=> fv2.embedding) <= (1.0-%s) AND 
                    fv1.file_id <> fv2.file_id
                JOIN mbox_file ff ON fv1.file_id = ff.file_id
                LEFT OUTER JOIN mbox_person fp ON fv1.person_id = fp.person_id
                WHERE fv2.voice_id = {voice_id} 
            """
        else:
            query += f"""
                JOIN mbox_voice fv2 ON (fv1.embedding <=> fv2.embedding)
                    BETWEEN (1-{last_similarity}) AND (1.0-%s) AND
                    fv1.file_id <> fv2.file_id 
                JOIN mbox_file ff ON fv1.file_id = ff.file_id
                LEFT OUTER JOIN mbox_person fp ON fv1.person_id = fp.person_id
                WHERE fv1.voice_id <> {last_voice_id} AND
                    fv2.voice_id = {voice_id} 
            """
        if media_list is not None and media_list != "0":
            query += f"AND fv1.file_id in ({media_list}) "
        query += """
            ORDER BY similarity DESC
            LIMIT %s
        """

        cursor.execute(query, (similarity,max_rows))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get a jpeg thumbnail for a face ##################################################################
@csrf_exempt
@permission_classes([IsAuthenticated])
@api_view(['GET'])
def get_face_image(request, face_id):
    # Retrieve headers
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    # Validate subscription
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        # Query the database
        face = FbxFace.objects.get(face_id=face_id)
        thumbnails = FbxThumbnail.objects.get(thumbnail_id=face.thumbnail_id)
        file_path = thumbnails.path

        if os.path.exists(thumbnails.path):
            file_path = thumbnails.path
        else:
            file_path = os.path.join(settings.MEDIA_ROOT,thumbnails.path)
 
        with open(file_path, 'rb') as f:
            f.seek(face.thumbnail_offset)
            temp = f.read(4)
            thumbnail_size = struct.unpack('<I', temp)[0]
            print(f"Reading {thumbnail_size} bytes from {thumbnails.path} starting {face.thumbnail_offset+4} for face_id={face_id}")
            f.seek(face.thumbnail_offset + 4)  # Skip the size bytes
            jpeg_thumbnail = f.read(thumbnail_size)
            
            # Validate JPEG data
            if jpeg_thumbnail[:2] != b'\xFF\xD8' or jpeg_thumbnail[-2:] != b'\xFF\xD9':
                return Response({'error': 'Invalid JPEG data'}, status=400)
            
            # Create a file-like object from the bytes
            jpeg_io = io.BytesIO(jpeg_thumbnail)
            
            # Use HttpResponse instead of FileResponse
            response = HttpResponse(jpeg_io, content_type='image/jpeg')
            response['Content-Disposition'] = f'inline; filename="face_{face_id}.jpg"'
            return response

    except FbxFile.DoesNotExist:
        return Response({'error': 'File not found.'}, status=404)
    except FbxThumbnail.DoesNotExist:
        return Response({'error': 'Thumbnail not found.'}, status=404)
    except IOError:
        return Response({'error': 'Error reading thumbnail file.'}, status=500)
    except struct.error:
        return Response({'error': 'Error parsing thumbnail size.'}, status=500)
    except Exception as e:
        print(e)


# Get a jpeg thumbnail for a file ##################################################################
@csrf_exempt
@permission_classes([IsAuthenticated])
@api_view(['GET'])
def get_thumbnail(request, file_id):
    # Retrieve headers
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    # Validate subscription
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        #Query the database
        file = FbxFile.objects.get(file_id=file_id)
        thumbnails = FbxThumbnail.objects.get(thumbnail_id=file.thumbnail_id)
        file_path = thumbnails.path

        if os.path.exists(thumbnails.path):
            file_path = thumbnails.path
        else:
            file_path = os.path.join(settings.MEDIA_ROOT,thumbnails.path)

        if not os.path.exists(file_path):
            print(f"{thumbnails.path} not found.")
            print(f"{file_path} not found.")
 
        with open(file_path, 'rb') as f:
            f.seek(file.thumbnail_offset)
            temp = f.read(4)
            thumbnail_size = struct.unpack('<I', temp)[0]
            #print(f"Reading {thumbnail_size} bytes from {thumbnails.path} starting {file.thumbnail_offset+4} for file_id={file_id}, name={file.name}")
            f.seek(file.thumbnail_offset + 4)  # Skip the size bytes
            jpeg_thumbnail = f.read(thumbnail_size)
            
            # Validate JPEG data
            if jpeg_thumbnail[:2] != b'\xFF\xD8' or jpeg_thumbnail[-2:] != b'\xFF\xD9':
                return Response({'error': 'Invalid JPEG data'}, status=400)
            
            # Create a file-like object from the bytes
            jpeg_io = io.BytesIO(jpeg_thumbnail)
            
            # Use HttpResponse instead of FileResponse
            response = HttpResponse(jpeg_io, content_type='image/jpeg')
            response['Content-Disposition'] = f'inline; filename="{file.name}_thumbnail.jpg"'
            return response

    except FbxFile.DoesNotExist:
        return Response({'error': 'File not found.'}, status=404)
    except FbxThumbnail.DoesNotExist:
        return Response({'error': 'Thumbnail not found.'}, status=404)
    except IOError:
        return Response({'error': 'Error reading thumbnail file.'}, status=500)
    except struct.error:
        return Response({'error': 'Error parsing thumbnail size.'}, status=500)


# Search the mbox_file table for videos #############################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_media(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    max_rows = request.headers.get('Max-Rows')
    start_from = request.headers.get('Start-From')
    pattern = request.headers.get('Pattern')
    scope = request.headers.get('Scope')
    media_type = request.headers.get('Media-Type')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    offset = 0
    if start_from is not None:
        offset = start_from

    # Append a wild card for the LIKE operator
    if scope[-1] != '/':
        scope += '/%'
    else:
        scope += '%'

    # Default media type is video
    if media_type is None:
        media_types = ('video',)
        placeholders = '%s'
    else:
        media_types = tuple(media_type.split(','))
        placeholders = ','.join(['%s'] * len(media_types))

    # Replace double quotes with single quotes if necessary
    if bool(re.match(r'^".*"$',pattern)):
        pattern = "'" + pattern[1:-1] + "'"

    # Search for matching records in the database
    labels = ['file_id', 'folder_id', 'file_name', 'extension', 'media_source', 'size', 'file_url', 
        'archive_url', 'date_created', 'date_uploaded', 'description', 'tags', 'people', 'places', 
        'texts', 'last_accessed', 'last_modified', 'owner_id', 'owner_name', 'group_id', 'group_name', 
        'owner_rights', 'group_rights', 'domain_rights', 'public_rights', 'ip_location', 'remarks', 'version', 
        'attributes', 'extra_data', 'file_status', 'title', 'creator', 'subject', 'publisher', 
        'contributor', 'identifier', 'language', 'relation', 'coverage', 'rights', 'rank'];

    if len(pattern) > 0:
        query = """
        SELECT fl.file_id, fl.folder_id, fl.name, fl.extension, fl.media_source, fl.size, fl.file_url, 
            fl.archive_url, fl.date_created, fl.date_uploaded, fl.description, fl.tags, fl.people, fl.places, 
            fl.texts, fl.last_accessed, fl.last_modified, fl.owner_id, fl.owner_name, fl.group_id, fl.group_name, 
            fl.owner_rights, fl.group_rights, fl.domain_rights, fl.public_rights, fl.ip_location, fl.remarks, fl.version, 
            fl.attributes, fl.extra_data, fl.status, fl.title, fl.creator, fl.subject, fl.publisher,
            fl.contributor, fl.identifier, fl.language, fl.relation, fl.coverage, fl.rights,
            ts_rank(search_text,to_tsquery('english',%s)) AS rank
        FROM mbox_file fl, mbox_folder fd
        WHERE fl.folder_id = fd.folder_id AND 
            fd.path_name LIKE %s AND
            fl.media_type IN ({}) AND 
            NOT fl.is_deleted AND 
            search_text @@ to_tsquery('english',%s)
        ORDER BY rank DESC
        LIMIT %s
        OFFSET %s
        """.format(placeholders)
    else:
        query = """
        SELECT fl.file_id, fl.folder_id, fl.name, fl.extension, fl.media_source, fl.size, fl.file_url, 
            fl.archive_url, fl.date_created, fl.date_uploaded, fl.description, fl.tags, fl.people, fl.places, 
            fl.texts, fl.last_accessed, fl.last_modified, fl.owner_id, fl.owner_name, fl.group_id, fl.group_name, 
            fl.owner_rights, fl.group_rights, fl.domain_rights, fl.public_rights, fl.ip_location, fl.remarks, fl.version, 
            fl.attributes, fl.extra_data, fl.status, fl.title, fl.creator, fl.subject, fl.publisher,
            fl.contributor, fl.identifier, fl.language, fl.relation, fl.coverage, fl.rights,
            fl.file_id AS rank
        FROM mbox_file fl, mbox_folder fd
        WHERE fl.folder_id = fd.folder_id AND 
            fd.path_name LIKE %s AND
            fl.media_type IN ({}) AND 
            NOT fl.is_deleted 
        ORDER BY file_id ASC
        LIMIT %s
        OFFSET %s
        """.format(placeholders)

    rows = []
    with connection.cursor() as cursor:
        if len(pattern) > 0:
            pattern = pattern.lower()
            params = (pattern, scope) + media_types + (pattern, max_rows, offset)
            cursor.execute(query, params)
        else:
            params = (scope,) + media_types + (max_rows, offset)
            cursor.execute(query, params)
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get items in the recycle bin #################################################
# This is identical to search_media() + is_deleted = True                      #
################################################################################
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_recycle_bin(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    max_rows = request.headers.get('Max-Rows')
    start_from = request.headers.get('Start-From')
    pattern = request.headers.get('Pattern')
    scope = request.headers.get('Scope')
    media_type = request.headers.get('Media-Type')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    offset = 0
    if start_from is not None:
        offset = start_from

    # Append a wild card for the LIKE operator
    if scope[-1] != '/':
        scope += '/%'
    else:
        scope += '%'

    # Default media type is video
    if media_type is None:
        media_types = ('video',)
        placeholders = '%s'
    else:
        media_types = tuple(media_type.split(','))
        placeholders = ','.join(['%s'] * len(media_types))

    # Replace double quotes with single quotes if necessary
    if bool(re.match(r'^".*"$',pattern)):
        pattern = "'" + pattern[1:-1] + "'"

    # Search for matching records in the database
    labels = ['file_id', 'folder_id', 'file_name', 'extension', 'media_source', 'size', 'file_url',
        'archive_url', 'date_created', 'date_uploaded', 'description', 'tags', 'people', 'places',
        'texts', 'last_accessed', 'last_modified', 'owner_id', 'owner_name', 'group_id', 'group_name',
        'owner_rights', 'group_rights', 'domain_rights', 'public_rights', 'ip_location', 'remarks', 'version',
        'attributes', 'extra_data', 'file_status', 'title', 'creator', 'subject', 'publisher',
        'contributor', 'identifier', 'language', 'relation', 'coverage', 'rights', 'rank'];

    if len(pattern) > 0:
        query = """
        SELECT fl.file_id, fl.folder_id, fl.name, fl.extension, fl.media_source, fl.size, fl.file_url, 
            fl.archive_url, fl.date_created, fl.date_uploaded, fl.description, fl.tags, fl.people, fl.places, 
            fl.texts, fl.last_accessed, fl.last_modified, fl.owner_id, fl.owner_name, fl.group_id, fl.group_name, 
            fl.owner_rights, fl.group_rights, fl.domain_rights, fl.public_rights, fl.ip_location, fl.remarks, fl.version, 
            fl.attributes, fl.extra_data, fl.status, fl.title, fl.creator, fl.subject, fl.publisher,
            fl.contributor, fl.identifier, fl.language, fl.relation, fl.coverage, fl.rights,
            ts_rank(search_text,to_tsquery('english',%s)) AS rank
        FROM mbox_file fl, mbox_folder fd
        WHERE fl.folder_id = fd.folder_id AND 
            fd.path_name LIKE %s AND
            fl.media_type IN ({}) AND 
            fl.is_deleted AND 
            search_text @@ to_tsquery('english',%s)
        ORDER BY rank DESC
        LIMIT %s
        OFFSET %s
        """.format(placeholders)
    else:
        query = """
        SELECT fl.file_id, fl.folder_id, fl.name, fl.extension, fl.media_source, fl.size, fl.file_url, 
            fl.archive_url, fl.date_created, fl.date_uploaded, fl.description, fl.tags, fl.people, fl.places, 
            fl.texts, fl.last_accessed, fl.last_modified, fl.owner_id, fl.owner_name, fl.group_id, fl.group_name, 
            fl.owner_rights, fl.group_rights, fl.domain_rights, fl.public_rights, fl.ip_location, fl.remarks, fl.version, 
            fl.attributes, fl.extra_data, fl.status, fl.title, fl.creator, fl.subject, fl.publisher,
            fl.contributor, fl.identifier, fl.language, fl.relation, fl.coverage, fl.rights,
            fl.file_id AS rank
        FROM mbox_file fl, mbox_folder fd
        WHERE fl.folder_id = fd.folder_id AND 
            fd.path_name LIKE %s AND
            fl.media_type IN ({}) AND 
            fl.is_deleted 
        ORDER BY file_id ASC
        LIMIT %s
        OFFSET %s
        """.format(placeholders)

    rows = []
    with connection.cursor() as cursor:
        if len(pattern) > 0:
            pattern = pattern.lower()
            params = (pattern, scope) + media_types + (pattern, max_rows, offset)
            cursor.execute(query, params)
        else:
            params = (scope,) + media_types + (max_rows, offset)
            cursor.execute(query, params)
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get a file from the mbox_file table ###############################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_media(request, file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['file_id', 'folder_id', 'file_name', 'folder_name', 'extension', 'media_source', 'size', 
        'file_url', 'archive_url', 'date_created', 'date_uploaded', 'description', 'tags', 'people', 
        'places', 'texts', 'last_accessed', 'last_modified', 'owner_id', 'owner_name', 'group_id', 
        'group_name', 'owner_rights', 'group_rights', 'domain_rights', 'public_rights', 'ip_location',
        'remarks', 'version', 'attributes', 'extra_data', 'file_status', 'title', 'creator', 'subject', 
        'publisher', 'contributor', 'identifier', 'language', 'relation', 'coverage', 'rights'];
    rows = []
    query = """
        SELECT f1.file_id, f1.folder_id, f1.name, f2.path_name, f1.extension, f1.media_source, f1.size, 
            f1.file_url, f1.archive_url, f1.date_created, f1.date_uploaded, f1.description, f1.tags, f1.people, 
            f1.places, f1.texts, f1.last_accessed, f1.last_modified, f1.owner_id, f1.owner_name, f1.group_id, 
            f1.group_name, f1.owner_rights, f1.group_rights, f1.domain_rights, f1.public_rights, f1.ip_location,
            f1.remarks, f1.version, f1.attributes, f1.extra_data, f1.status, f1.title, f1.creator, f1.subject,
            f1.publisher, f1.contributor, f1.identifier, f1.language, f1.relation, f1.coverage, f1.rights
        FROM mbox_file f1 JOIN mbox_folder f2 ON f1.folder_id = f2.folder_id
        WHERE NOT f1.is_deleted AND f1.file_id = %s 
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (file_id,))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Update the last_accessed field 
    if len(rows):
        update_last_accessed(file_id)

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get previous or next file from the mbox_file table ################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_adjacent_media(request, file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    direction = request.headers.get('Direction')
    media_type = request.headers.get('Media-Type') 
    folder_id = request.headers.get('Folder-ID')
    skip_status = request.headers.get('Skip-Status')
 
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['file_id', 'folder_id', 'file_name', 'folder_name', 'extension', 'media_source', 'size', 'file_url', 
        'archive_url', 'date_created', 'date_uploaded', 'description', 'tags', 'people', 'places', 'texts', 
        'last_accessed', 'last_modified', 'owner_id', 'owner_name', 'group_id', 'group_name', 
        'owner_rights', 'group_rights', 'domain_rights', 'public_rights', 'ip_location',
        'remarks', 'version', 'attributes', 'extra_data', 'file_status', 'title', 'creator', 'subject',
        'publisher', 'contributor', 'identifier', 'language', 'relation', 'coverage', 'rights'];
    rows = []

    symbol = '<' 
    order = 'DESC'
    if direction.lower() == 'forward':
        symbol = '>' 
        order = 'ASC'

    media_types = tuple(media_type.split(','))
    placeholders1 = ','.join(['%s'] * len(media_types))

    skip_statuses = tuple(skip_status.split(','))
    placeholders2 = ','.join(['%s'] * len(skip_statuses))

    query = f"""
    SELECT f1.file_id, f1.folder_id, f1.name, f2.path_name, f1.extension, f1.media_source, f1.size, f1.file_url, 
        f1.archive_url, f1.date_created, f1.date_uploaded, f1.description, f1.tags, f1.people, f1.places, f1.texts, 
        f1.last_accessed, f1.last_modified, f1.owner_id, f1.owner_name, f1.group_id, f1.group_name, 
        f1.owner_rights, f1.group_rights, f1.domain_rights, f1.public_rights, f1.ip_location,
        f1.remarks, f1.version, f1.attributes, f1.extra_data, f1.status, f1.title, f1.creator, f1.subject,
            f1.publisher, f1.contributor, f1.identifier, f1.language, f1.relation, f1.coverage, f1.rights
    FROM mbox_file f1 JOIN mbox_folder f2 ON f1.folder_id = f2.folder_id
    WHERE NOT f1.is_deleted AND 
        f1.file_id {symbol} %s AND 
        f1.folder_id = %s AND
        f1.media_type IN ({placeholders1}) AND
        (f1.status NOT IN ({placeholders2}) OR f1.status IS NULL)
    ORDER BY f1.file_id {order}
    LIMIT 1
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (file_id,folder_id,) + media_types + skip_statuses)
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Update the last_accessed field
    if len(rows): 
        update_last_accessed(rows[0][0])

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get a folder from the mbox_folder table ###########################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_folder(request, folder_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['folder_id', 'name', 'path', 'size', 'date_created', 'folder_level', 'description',
        'last_accessed', 'last_modified', 'owner_id', 'owner_name', 'group_id', 'group_name',
        'owner_rights', 'group_rights', 'domain_rights', 'public_rights', 'subfolder_count', 'file_count', 
        'video_count', 'audio_count', 'photo_count', 'reviewed_count', 'page_count', 'stats_as_of',
        'parent_id', 'remarks', 'schema_id', 'extra_data'];
    rows = []
    query = """
        SELECT folder_id, name, path, size, date_created, folder_level, description,
            last_accessed, last_modified, owner_id, owner_name, group_id, group_name,
            owner_rights, group_rights, domain_rights, public_rights, subfolder_count, file_count, 
            video_count, audio_count, photo_count, reviewed_count, page_count, stats_as_of,
            parent_id, remarks, schema_id, extra_data
        FROM mbox_folder
        WHERE folder_id = %s
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (folder_id,))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Update the last_accessed field
    if len(rows): 
        update_last_accessed(folder_id,'folder')

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get folders from the mbox_folder table ############################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_folders(request, parent_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
   
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['folder_id', 'name', 'path', 'size', 'date_created', 'folder_level', 'description',
        'last_accessed', 'last_modified', 'owner_id', 'owner_name', 'group_id', 'group_name',
        'owner_rights', 'group_rights', 'domain_rights', 'public_rights', 'subfolder_count', 'file_count', 
        'video_count', 'audio_count', 'photo_count', 'reviewed_count', 'page_count', 'stats_as_of',
        'parent_id', 'remarks', 'schema_id', 'extra_data'];
    rows = []
    query = """
        SELECT folder_id, name, path, size, date_created, folder_level, description,
            last_accessed, last_modified, owner_id, owner_name, group_id, group_name,
            owner_rights, group_rights, domain_rights, public_rights, subfolder_count, file_count, 
            video_count, audio_count, photo_count, reviewed_count, page_count, stats_as_of,
            parent_id, remarks, schema_id, extra_data
        FROM mbox_folder
    """
    if parent_id > 0:
        query += "WHERE NOT is_deleted AND parent_id = %s"
    else:
        query += "WHERE NOT is_deleted AND parent_id IS NULL"

    with connection.cursor() as cursor:
        if parent_id > 0:
            cursor.execute(query, (parent_id,))
        else:
            cursor.execute(query, )
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Update the last_accessed field
    if len(rows): 
        update_last_accessed(parent_id,'folder')

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get groups of the specified user ################################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_groups(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    groups = list(request.user.groups.all())
    for i, group in enumerate(groups):
        if group.name == settings.MBOX_SUPERVISORS_GROUP:
            groups[i] = 'Supervisors'
        elif group.name == settings.MBOX_EDITORS_GROUP:
            groups[i] = 'Editors'
        else:
            groups[i] = group.name.title()

    return Response({'groups':groups}, status=status.HTTP_200_OK)


# Search the mbox_person table ######################################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_person(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    video_list = request.headers.get('Video-List')
    max_rows = request.headers.get('Max-Rows')
    start_from = request.headers.get('Start-From')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    last_person_id = 0
    if start_from is not None:
        json_start_from = json.loads(start_from)
        last_person_id = json_start_from['person_id']

    # Search for matching records in the database
    labels = ['person_id', 'full_name', 'last_name', 'first_name', 'middle_name', 'birth_country', 'birth_city',
        'birth_date', 'face', 'box', 'pose', 'quality', 'gender', 'age_range', 'confidence', 'face_id', 
        'file_name', 'file_url', 'time_start', 'time_end', 'face_ref'];
    rows = []
    if video_list == "0":
        query = """
            SELECT fp.person_id, fp.full_name, fp.last_name, fp.first_name, fp.middle_name, fp.birth_country, 
                fp.birth_city, fp.birth_date, fp.face, fp.box, fp.pose, fp.quality, fp.gender, fp.age_range, 
                fp.confidence, MIN(ff.face_id), fl.name AS file_name, fl.file_url, 
                MIN(ff.time_start), MAX(ff.time_end), fp.face_id
            FROM mbox_person fp, mbox_face ff, mbox_file fl
            WHERE fp.person_id = ff.person_id AND ff.file_id = fl.file_id AND fp.person_id > %s 
            GROUP BY fp.person_id, fp.full_name, fp.last_name, fp.first_name, fp.middle_name, fp.birth_country, 
                fp.birth_city, fp.birth_date, fp.face, fp.box, fp.pose, fp.quality, fp.gender, fp.age_range, 
                fp.confidence, fp.face_id, fl.name, fl.file_url
            ORDER BY fp.person_id ASC
            LIMIT %s
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (last_person_id, max_rows))
            rows = cursor.fetchall()

    else:
        query = """
            SELECT fp.person_id, fp.full_name, fp.last_name, fp.first_name, fp.middle_name, fp.birth_country, 
                fp.birth_city, fp.birth_date, fp.face, fp.box, fp.pose, fp.quality, fp.gender, fp.age_range, 
                fp.confidence, MIN(ff.face_id), fl.name AS file_name, fl.file_url, 
                MIN(ff.time_start), MAX(ff.time_end), fp.face_id
            FROM mbox_person fp, mbox_face ff, mbox_file fl
            WHERE fp.person_id = ff.person_id AND ff.file_id = fl.file_id AND ff.file_id IN (%s) AND fp.person_id > %s 
            GROUP BY fp.person_id, fp.full_name, fp.last_name, fp.first_name, fp.middle_name, fp.birth_country, 
                fp.birth_city, fp.birth_date, fp.face, fp.box, fp.pose, fp.quality, fp.gender, fp.age_range, 
                fp.confidence, fp.face_id, fl.name, fl.file_url
            ORDER BY fp.person_id ASC
            LIMIT %s
        """

        with connection.cursor() as cursor:
            cursor.execute(query, (video_list, last_person_id, max_rows))
            rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get transcript of a file #########################################################################
@csrf_exempt
@permission_classes([IsAuthenticated])
@api_view(['GET'])
def get_transcript(request,file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    max_rows = request.headers.get('Max-Rows')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    labels = ['file_id','webvtt']
    query = "SELECT file_id, webvtt FROM mbox_file WHERE file_id = %s"
    
    with connection.cursor() as cursor:
        cursor.execute(query, (file_id,))
        rows = cursor.fetchall()

    # Close cursor
    cursor.close()

    # Update the last_accessed field
    if len(rows): 
        update_last_accessed(file_id,'file')

    if len(rows):
        return Response({'transcript': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'transcript': []}, status=status.HTTP_200_OK)


# Get audit records for a file #####################################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_audit(request,file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    max_rows = request.headers.get('Max-Rows')
    table_name = request.headers.get('Source-Table')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['audit_id', 'username', 'activity', 'event_timestamp', 'location', 'table_name', 
        'record_id', 'old_data', 'new_data', 'remarks']
    rows = []
    if file_id == 0:
        query = """
            SELECT audit_id, username, activity, event_timestamp, location, table_name, 
                record_id, old_data, new_data, remarks
            FROM mbox_audit
            WHERE table_name = %s
            ORDER BY audit_id DESC
            LIMIT %s
        """

        with connection.cursor() as cursor:
            cursor.execute(query, (table_name, max_rows))
            rows = cursor.fetchall()
    else:
        query = """
            SELECT audit_id, username, activity, event_timestamp, location, table_name,
                record_id, old_data, new_data, remarks
            FROM mbox_audit
            WHERE record_id = %s AND table_name = %s
            ORDER BY audit_id DESC
            LIMIT %s
        """

        with connection.cursor() as cursor:
            cursor.execute(query, (file_id, table_name, max_rows))
            rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Search audit records #############################################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_audit(request):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    max_rows = request.headers.get('Max-Rows')
    username = request.headers.get('Username')
    start_date = request.headers.get('Start-Date')
    end_date = request.headers.get('End-Date')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['audit_id', 'username', 'activity', 'event_timestamp', 'location', 'table_name', 
        'record_id', 'old_data', 'new_data', 'remarks']
    rows = []
    query = """
        SELECT audit_id, username, activity, event_timestamp, location, table_name, 
            record_id, old_data, new_data, remarks
        FROM mbox_audit
        WHERE username LIKE %s AND 
            event_timestamp BETWEEN %s AND %s
        ORDER BY audit_id DESC
        LIMIT %s
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (username, start_date, end_date, max_rows))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# Get segments of speech aka diaries of a file #####################################################
@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_diary(request,file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Search for matching records in the database
    labels = ['voice_id', 'file_id', 'person_id', 'speaker', 'time_start', 'time_end',
        'full_name', 'first_name', 'middle_name', 'last_name']
    rows = []
    query = """
        SELECT fv.voice_id, fv.file_id, fv.person_id, fv.speaker, fv.time_start, fv.time_end,
            fp.full_name, fp.first_name, fp.middle_name, fp.last_name
        FROM mbox_voice fv LEFT OUTER JOIN mbox_person fp ON fv.person_id = fp.person_id
        WHERE fv.file_id = %s
        ORDER BY time_start ASC
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (file_id,))
        rows = cursor.fetchall()

    # Close database connection
    cursor.close()

    # Update the last_accessed field
    if len(rows): 
        update_last_accessed(file_id,'file')

    # Serialize the results and return the response
    if len(rows):
        return Response({'results': tuples_to_json(rows,labels)}, status=status.HTTP_200_OK)
    else:
        return Response({'results': []}, status=status.HTTP_200_OK)


# HTML web pages ###################################################################################
def app_login(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        user = authenticate(request, username=username, password=password)

        if user is not None:
            login(request, user)
            request.session['auth_method'] = 'default'
            return JsonResponse({"message": "success"}, status=200)
        else:
            return JsonResponse({"message": "fail"}, status=400)
    return render(request, 'login.html')

def app_logout(request):
    auth_method = request.session.get('auth_method')
    if auth_method is not None:
        if auth_method == 'default':
            logout(request)
    else:
        redirect('/oauth2/logout')
    return redirect('/login/')

@login_required
def video_search(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'video_search.html', context);

@login_required
def media_player(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'media_player.html', context);

@login_required
def photo_viewer(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'photo_viewer.html', context);

@login_required
def photo_search(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'photo_search.html', context);

@login_required
def audio_search(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'audio_search.html', context);

@login_required
def face_search(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'face_search.html', context)

@login_required
def voice_search(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'allow_edit': is_editor,
    }
    return render(request, 'voice_search.html', context)

@login_required
def reports_viewer(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    is_supervisor = groups.filter(name=settings.MBOX_SUPERVISORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'is_editor': is_editor,
        'is_supervisor': is_supervisor,
    }
    return render(request, 'reports.html', context)

@login_required
def library_viewer(request):
    groups = request.user.groups.all()
    is_editor = groups.filter(name=settings.MBOX_EDITORS_GROUP).exists()
    is_supervisor = groups.filter(name=settings.MBOX_SUPERVISORS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'is_editor': is_editor,
        'is_supervisor': is_supervisor,
    }
    return render(request, 'library.html', context)

@login_required
def api_tester(request):
    groups = request.user.groups.all()
    is_developer = groups.filter(name=settings.MBOX_DEVELOPERS_GROUP).exists()
    context = { 
        'file_id':request.GET.get('file_id','0'), 
        'file_name':request.GET.get('file_name',''),
        'username':request.user.first_name,
        'is_developer': is_developer,
    }
    return render(request, 'api_tester.html', context)

####################################################################################################
# The following are for handling streaming the audio fro Azure Blob Storage. #######################

@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stream_audio(request, file_id):

    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    time_offset = float(request.headers.get('Time-Offset'))

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Query the database, get the file record
    file = FbxFile.objects.get(file_id=file_id)
    folder = FbxFolder.objects.get(folder_id=file.folder_id)

    # Get the blob file from Azure
    blob_service_client = BlobServiceClient.from_connection_string(settings.AZURE_CONNECTION_STRING)
    blob_client = blob_service_client.get_blob_client(container=folder.name, blob=file.name)

    # Get the blob's total size
    blob_properties = blob_client.get_blob_properties()
    total_length = blob_properties.size

    # Calculate the byte offset
    bit_rate = float(file.attributes['Bitrate'])
    byte_offset = int(time_offset * bit_rate / 8.0)

    # Ensure the start position is valid
    if byte_offset >= total_length:
        byte_offset = total_length - 1

    # Set the content range for partial content
    content_range = f"bytes {byte_offset}-{total_length - 1}/{total_length}"

    # Helper function to stream the blob from a specific offset
    def stream_blob_from_offset(offset=0, chunk_size=8192):
        stream = blob_client.download_blob(offset=offset)
        for chunk in stream.chunks():
            yield chunk

    # Update the last_accessed field
    update_last_accessed(file_id,'file')

    # Return the StreamingHttpResponse with the appropriate content
    response = StreamingHttpResponse(
        stream_blob_from_offset(offset=byte_offset),
        status=206,  # Partial Content
        content_type='audio/mpeg'
    )
    response['Content-Range'] = content_range
    response['Accept-Ranges'] = 'bytes'
    response['Content-Length'] = str(total_length - byte_offset)
    
    return response
