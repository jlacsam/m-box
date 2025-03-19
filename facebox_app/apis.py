import os
import json
import boto3

from django.conf import settings
from django.db import connection
from django.shortcuts import get_object_or_404, redirect
from django.contrib.auth.models import User
from django.contrib.auth.models import Group
from django.core.files.storage import default_storage

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from urllib.parse import urlparse
from .utils import validate_subscription, get_client_ip, check_folder_permission, check_file_permission, insert_audit, update_last_accessed, update_last_modified, validate_subscription_headers, update_text_embedding, upload_to_storage
from .models import MboxFile, MboxFolder, MboxPerson


# Create Folder ####################################################################################
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def create_folder(request,parent_id):

    if not check_folder_permission(request,parent_id,'add'):
        return Response({'error':'Permission denied. Write permission on the parent folder is required.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    try:
        data = request.data 
        name = data.get('name')
        description = data.get('description')
        remarks = data.get('remarks')
    except Exception as e:
        return Response({'error': 'Invalid JSON in request body'}, status=status.HTTP_400_BAD_REQUEST)

    if not name:
        return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)

    parent = get_object_or_404(MboxFolder, folder_id=parent_id)

    try:
        folder = MboxFolder(
            name = name,
            path = parent.path_name,
            parent_id = parent_id,
            description = description,
            folder_level = parent.folder_level + 1,
            owner_id = request.user.id,
            owner_name = request.user.username,
            group_id = parent.group_id,
            group_name = parent.group_name,
            remarks = remarks
        )
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert an audit record for this action
    insert_audit(request.user.username,'CREATE FOLDER','mbox_folder',parent_id,None,name,get_client_ip(request))
    update_last_modified(parent_id,'folder')

    return Response({'result':folder.folder_id,'folder_level':folder.folder_level}, status=status.HTTP_200_OK)


# Rename Folder ####################################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def rename_folder(request,folder_id):

    # Check if the user has permission to update the folder record
    if not check_folder_permission(request,folder_id,'rename'):
        return Response({'error':'Permission denied. Write and execute permissions on the folder are required.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)
    try:
        name = request.data.get('name')
        old_path_name = folder.path_name
        old_path = folder.path
        old_name = folder.name
        folder.name = name
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Update the path of all of its children folders
    # Only update the path. The trigger will take care of the path_name.
    try:
        new_path = old_path + name + '/'
        pattern = old_path_name + '%'
        query = "UPDATE mbox_folder SET path = REPLACE(path,%s,%s) WHERE path LIKE %s"
        with connection.cursor() as cursor:
            cursor.execute(query, (old_path_name,new_path,pattern))
            affected = cursor.rowcount
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert an audit record for this action
    insert_audit(request.user.username,'RENAME','mbox_folder',folder_id,old_name,name,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success','affected':affected+1}, status=status.HTTP_200_OK)


# Rename File ######################################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def rename_file(request,file_id):

    # Check if the user has permission to update the file record
    if not check_file_permission(request,file_id,'rename'):
        return Response({'error':'Permission denied. Write permission on the file is required.'},
                            status=status.HTTP_401_UNAUTHORIZED)

    file = get_object_or_404(MboxFile, file_id=file_id)
    try:
        old_name = file.name
        file.name = request.data.get('name')
        file.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'RENAME','mbox_file',file_id,old_name,file.name,get_client_ip(request))
    update_last_modified(file_id)

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set Folder Owner #################################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_folder_owner(request,folder_id,owner_name):

    if not check_folder_permission(request,folder_id,'set_owner'):
        return Response({'error':'Permission denied. Only the owner and administrator ' \
                        'can change the ownership of a folder.'}, status=status.HTTP_401_UNAUTHORIZED)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)

    if folder.owner_name == owner_name:
        return Response({'error':f'Owner is already {owner_name}.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        old_owner_name = folder.owner_name
        new_owner = User.objects.get(username=owner_name)
        folder.owner_id = new_owner.id
        folder.owner_name = owner_name
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET OWNER','mbox_folder',folder_id,
                 old_owner_name,owner_name,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set File Owner ###################################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_file_owner(request,file_id,owner_name):

    if not check_file_permission(request,file_id,'set_owner'):
        return Response({'error':'Permission denied. Only the owner and administrator ' \
                        'can change the owner of a file.'}, status=status.HTTP_401_UNAUTHORIZED)

    file = get_object_or_404(MboxFile, file_id=file_id)

    if file.owner_name == owner_name:
        return Response({'error':f'Owner is already {owner_name}.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        old_owner_name = file.owner_name
        new_owner = User.objects.get(username=owner_name)
        file.owner_id = new_owner.id
        file.owner_name = owner_name
        file.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET OWNER','mbox_file',file_id,
                 old_owner_name,owner_name,get_client_ip(request))
    update_last_modified(file_id,'file')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set Folder Group #################################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_folder_group(request,folder_id,group_name):

    if not check_folder_permission(request,folder_id,'set_group'):
        return Response({'error':'Permission denied. Only the owner and administrator ' \
                        'can change the group of a folder.'}, status=status.HTTP_401_UNAUTHORIZED)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)

    try:
        old_group_name = folder.group_name
        new_group = Group.objects.get(name=group_name)
        folder.group_id = new_group.id
        folder.group_name = group_name
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET GROUP','mbox_folder',folder_id,
                 old_group_name,group_name,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set File Group ###################################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_file_group(request,file_id,group_name):

    if not check_file_permission(request,file_id,'set_group'):
        return Response({'error':'Permission denied. Only the owner and administrator ' \
                        'can change the group of a file.'}, status=status.HTTP_401_UNAUTHORIZED)

    file = get_object_or_404(MboxFile, file_id=file_id)

    if not request.user.is_superuser:
        if request.user.username.lower() != file.owner_name.lower():
            return Response({'error':'Permission denied.'})

    if file.group_name == group_name:
        return Response({'error':'Group name already matches the specified value.'})

    try:
        old_group_name = file.group_name
        new_group = Group.objects.get(name=group_name)
        file.group_id = new_group.id
        file.group_name = group_name
        file.save()
    except Group.DoesNotExist:
        return Response({'error': f'Group {group_name} not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET GROUP','mbox_file',file_id,
                 old_group_name,group_name,get_client_ip(request))
    update_last_modified(file_id,'file')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set Folder Permission ############################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_folder_permission(request,folder_id,owner_rights,group_rights,domain_rights,public_rights):

    if not check_folder_permission(request,folder_id,'set_permission'):
        return Response({'error':'Permission denied. Only the owner and administrator ' \
                        'can change the permissions of a folder.'}, status=status.HTTP_401_UNAUTHORIZED)

    if owner_rights > 7 or group_rights > 7 or domain_rights > 7 or public_rights > 7:
        return Response({'error':'Invalid value(s)'}, status=status.HTTP_400_BAD_REQUEST)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)

    old_permissions = f"{folder.owner_rights}|{folder.group_rights}|{folder.domain_rights}|{folder.public_rights}"
    new_permissions = f"{owner_rights}|{group_rights}|{domain_rights}|{public_rights}"
    if old_permissions == new_permissions:
        return Response({'error':'No change in permissions detected.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        folder.owner_rights = owner_rights
        folder.group_rights = group_rights
        folder.domain_rights = domain_rights
        folder.public_rights = public_rights
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET PERMISSION','mbox_folder',folder_id,
                 old_permissions,new_permissions,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set group for an entire directory tree ###########################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_tree_group(request,folder_id,group_name):

    if not check_folder_permission(request,folder_id,'set_tree_group'):
        return Response({'error':'Permission denied. Only the administrator ' \
                        'can change the group of a folder tree.'}, status=status.HTTP_401_UNAUTHORIZED)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)
    pattern = folder.path + '%'
    new_group = Group.objects.get(name=group_name)

    query = """
        UPDATE mbox_folder
        SET group_id = %s, group_name = %s
        WHERE path LIKE %s
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (new_group.id, group_name, pattern))
        affected = cursor.rowcount

    query = """
        UPDATE mbox_file
        SET group_id = %s, group_name = %s
        WHERE folder_id IN (
            SELECT folder_id FROM mbox_folder WHERE path LIKE %s
        )
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (new_group.id, group_name, pattern))
        affected += cursor.rowcount

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET TREE GROUP','mbox_folder',folder_id,
                 folder.group_name,group_name,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set owner for an entire directory tree ###########################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_tree_owner(request,folder_id,owner_name):

    if not check_folder_permission(request,folder_id,'set_tree_owner'):
        return Response({'error':'Permission denied. Only the administrator ' \
                        'can change the owner of a folder tree.'}, status=status.HTTP_401_UNAUTHORIZED)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)
    pattern = folder.path + '%'
    new_owner = User.objects.get(username=owner_name)

    query = """
        UPDATE mbox_folder
        SET owner_id = %s, owner_name = %s
        WHERE path LIKE %s
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (new_owner.id, owner_name, pattern))
        affected = cursor.rowcount

    query = """
        UPDATE mbox_file
        SET owner_id = %s, owner_name = %s
        WHERE folder_id IN (
            SELECT folder_id FROM mbox_folder WHERE path LIKE %s
        )
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (new_owner.id, owner_name, pattern))
        affected += cursor.rowcount

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET TREE OWNER','mbox_folder',folder_id,
                 folder.owner_name,owner_name,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set permission for an entire directory tree ######################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_tree_permission(request,folder_id,owner_rights,group_rights,domain_rights,public_rights):

    if not check_folder_permission(request,folder_id,'set_tree_permission'):
        return Response({'error':'Permission denied. Only the administrator ' \
                        'can change the permissions of a folder tree.'}, status=status.HTTP_401_UNAUTHORIZED)

    if owner_rights > 7 or group_rights > 7 or domain_rights > 7 or public_rights > 7:
        return Response({'error':'Invalid value(s)'}, status=status.HTTP_400_BAD_REQUEST)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)
    pattern = folder.path + '%'

    query = """
        UPDATE mbox_folder
        SET owner_rights = %s, group_rights = %s, domain_rights = %s, public_rights = %s
        WHERE path LIKE %s
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (owner_rights, group_rights, domain_rights, public_rights, pattern))
        affected = cursor.rowcount

    query = """
        UPDATE mbox_file
        SET owner_rights = %s, group_rights = %s, domain_rights = %s, public_rights = %s
        WHERE folder_id IN (
            SELECT folder_id FROM mbox_folder WHERE path LIKE %s
        )
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (owner_rights, group_rights, domain_rights, public_rights, pattern))
        affected += cursor.rowcount

    # Insert audit record, update last_modified
    new_permissions = f"{owner_rights}|{group_rights}|{domain_rights}|{public_rights}"
    insert_audit(request.user.username,'SET TREE PERMISSION','mbox_folder',folder_id,
                 None,new_permissions,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Set File Permission ##############################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def set_file_permission(request,file_id,owner_rights,group_rights,domain_rights,public_rights):

    if not check_file_permission(request,file_id,'set_permission'):
        return Response({'error':'Permission denied. Only the owner and administrator ' \
                        'can change the permissions of a file.'}, status=status.HTTP_401_UNAUTHORIZED)

    if owner_rights > 7 or group_rights > 7 or domain_rights > 7 or public_rights > 7:
        return Response({'error':'Invalid value(s)'}, status=status.HTTP_400_BAD_REQUEST)

    file = get_object_or_404(MboxFile, file_id=file_id)

    old_permissions = f"{file.owner_rights}|{file.group_rights}|{file.domain_rights}|{file.public_rights}"
    new_permissions = f"{owner_rights}|{group_rights}|{domain_rights}|{public_rights}"
    if old_permissions == new_permissions:
        return Response({'error':'No change in permissions detected.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        file.owner_rights = owner_rights
        file.group_rights = group_rights
        file.domain_rights = domain_rights
        file.public_rights = public_rights
        file.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR) 

    # Insert audit record, update last_modified
    insert_audit(request.user.username,'SET PERMISSION','mbox_file',file_id,
                 old_permissions,new_permissions,get_client_ip(request))
    update_last_modified(file_id,'file')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Unlink two or more faces from a person ###########################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def unlink_faces(request, person_id):

    # Check if user is a member of the editors group
    groups = request.user.groups.all()
    if not groups:
        return Response({'error': 'User is not allowed to perform database updates.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    if not groups.filter(name=settings.MBOX_EDITORS_GROUP).exists():
        return Response({'error': 'User is not allowed to perform database updates.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    faces_list = request.data
    if not isinstance(faces_list, list) or not all(isinstance(i, int) for i in faces_list):
        return Response({"error": "Invalid input. Expected a list of integers."}, status=status.HTTP_400_BAD_REQUEST)  
    placeholders = ', '.join(['%s'] * len(faces_list))
    query = f"""
        UPDATE mbox_face SET person_id = NULL
        WHERE person_id = %s AND face_id IN ({placeholders})
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (person_id, *faces_list,))
        count = cursor.rowcount
        old_data = {'person_id':person_id}
        new_data = {'faces_list':faces_list}
        insert_audit(request.user.username,'UNLINK FACES','mbox_face',person_id,old_data,new_data,get_client_ip(request))

    # Return the number of rows affected
    return Response({'rowcount':count}, status=status.HTTP_200_OK)


# Move folder to another parent ####################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def move_folder(request,folder_id,target_folder):

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)
    old_parent = get_object_or_404(MboxFolder, folder_id=folder.parent_id)
    new_parent = get_object_or_404(MboxFolder, folder_id=target_folder)

    # Check if the user has permission to remove the folder from its parent
    if not check_folder_permission(request,folder.parent_id,'delete'):
        return Response({'error':'Permission denied. Write and execute permissions ' \
                        'on the parent folder are required.'}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if the user has permission to add the folder to the new parent
    if not check_folder_permission(request,target_folder,'add'):
        return Response({'error':'Permission denied. Write and execute permissions ' \
                        'on the target folder are required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        old_path_name = folder.path_name
        new_path = new_parent.path_name
        folder.parent_id = target_folder
        folder.path = new_path
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Update paths of all children
    new_path_name = new_parent.path_name + folder.name + '/'
    pattern = old_path_name + '%'
    query = "UPDATE mbox_folder SET path = REPLACE(path,%s,%s) WHERE path LIKE %s"
    with connection.cursor() as cursor:
        cursor.execute(query, (old_path_name,new_path_name,pattern))
        affected = cursor.rowcount

    # Insert audit record, update last_modified
    insert_audit(request.user.username, 'MOVE', 'mbox_folder', folder_id,
                 old_path_name, new_path_name, get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success','affected':affected+1}, status=status.HTTP_200_OK)


# Move file from one folder to another #############################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def move_file(request,file_id,target_folder):

    file = get_object_or_404(MboxFile, file_id=file_id)
    old_folder = get_object_or_404(MboxFolder, folder_id=file.folder_id)
    new_folder = get_object_or_404(MboxFolder, folder_id=target_folder)

    # Check if the user has permission to remove the file from the source folder
    if not check_folder_permission(request,file.folder_id,'delete'):
        return Response({'error':'Permission denied. Write and execute permissions ' \
                        'on the source folder are required.'}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if the user has permission to add the file to the target folder
    if not check_folder_permission(request,target_folder,'add'):
        return Response({'error':'Permission denied. Write and execute permissions ' \
                        'on the target folder are required.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file.folder_id = target_folder
        file.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Insert audit record, update last_modified
    insert_audit(request.user.username, 'MOVE', 'mbox_file', file_id,
                 old_folder.path_name, new_folder.path_name, get_client_ip(request))
    update_last_modified(file_id)

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Refresh folder statistics ########################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def refresh_folder_stats(request, folder_id):

    # Check if user is a member of the SUPERVISORS group
    groups = request.user.groups.all()
    if not groups:
        return Response({'error': 'User is not allowed to perform folder stats update.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    if not groups.filter(name=settings.MBOX_SUPERVISORS_GROUP).exists():
        return Response({'error': 'User is not allowed to perform folder stats update.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    with connection.cursor() as cursor:
        cursor.execute('CALL refresh_folder_stats(%s, 0)', [folder_id])
        rowcount = cursor.fetchone()[0]

    # Insert audit record for this action
    insert_audit(request.user.username,'REFRESH FOLDER STATS','mbox_folder',
                 folder_id,None,None,get_client_ip(request))

    return Response({'rowcount':rowcount}, status=status.HTTP_200_OK)


# Mark a folder record as deleted ##################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def delete_folder(request,folder_id):

    if not check_folder_permission(request,folder_id,'delete'):
        return Response({'error':'Permission denied. Write and execute permissions ' \
                        'on the parent folder are required.'}, status=status.HTTP_401_UNAUTHORIZED)

    query = "SELECT COUNT(*) FROM mbox_file WHERE folder_id = %s AND NOT is_deleted"
    with connection.cursor() as cursor:
        cursor.execute(query, (folder_id,))
        count = cursor.fetchone()[0]

    if count > 0:
        return Response({'error':'Folder is not empty.'}, status=status.HTTP_400_BAD_REQUEST)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)

    if folder.is_deleted:
        return Response({'error':'Folder is already deleted.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Append the folder_id to the name so that inserting new folders with the same name
        # to the same folder won't violate the unique constraint (path,name)
        folder.name += f"__{folder_id}"
        folder.is_deleted = True
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # No need to delete the entire folder tree because of the requirement above:
    # The folder must be empty in order to be deleted.

    insert_audit(request.user.username,'DELETE','mbox_folder',folder_id,None,None,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Mark a file record as deleted ####################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def delete_file(request,file_id):

    if not check_file_permission(request,file_id,'delete'):
        return Response({'error':'Permission denied. Write permission on the parent folder is required.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    file = get_object_or_404(MboxFile, file_id=file_id)

    if file.is_deleted:
        return Response({'error':'File is already deleted.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        # Append the file_id to the name so that inserting new files with the same name
        # to the same folder won't violate the unique constraint (folder_id,name)
        file.name += f"__{file_id}"
        file.is_deleted = True
        file.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    insert_audit(request.user.username,'DELETE','mbox_file',file_id,None,None,get_client_ip(request))
    update_last_modified(file_id,'file')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Get the number of files in a folder ##############################################################
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def get_file_count(request, folder_id):

    query = f"SELECT COUNT(*) FROM mbox_file WHERE NOT is_deleted AND folder_id = %s"
    with connection.cursor() as cursor:
        cursor.execute(query, (folder_id,))
        count = cursor.fetchone()[0]

    return Response({'result': count}, status=status.HTTP_200_OK)


# Get the number of files that come before the given file relative to the folder ###################
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def get_file_position(request, file_id):
    folder_id = request.headers.get('Folder-ID')

    query = f"SELECT COUNT(*) FROM mbox_file WHERE NOT is_deleted AND folder_id = %s AND file_id <= %s"
    with connection.cursor() as cursor:
        cursor.execute(query, (folder_id,file_id,))
        position = cursor.fetchone()[0]

    return Response({'result': position}, status=status.HTTP_200_OK)


# Get a presigned url ##############################################################################
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_presigned_url(request, file_id, for_streaming=True):
    # Configure S3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_DEFAULT_REGION
    )

    try:
        # Get file object from database
        file = MboxFile.objects.get(file_id=file_id)

        if file.disabled:
            return Response({'error': 'File is disabled.'}, status=status.HTTP_400_BAD_REQUEST)

        # Get storage bucket name and storage key
        if "://" in file.storage_key:
            parsed_url = urlparse(file.storage_key)
            bucket_name = parsed_url.netloc
            storage_key = parsed_url.path.lstrip('/')
        else:
            bucket_name = settings.AWS_STORAGE_BUCKET_NAME
            storage_key = file.storage_key

        # Generate presigned URL with 24-hour expiration
        target = "inline" if for_streaming else f"attachment; filename={file.name}"
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket_name,
                'Key': storage_key,
                'ResponseContentDisposition': target,
            },
            ExpiresIn=settings.MBOX_URL_EXPIRATION # in seconds
        )
        
        insert_audit(request.user.username,'VIEW ASSET','mbox_file',file_id,None,None,get_client_ip(request))
        update_last_accessed(file_id,'file')

        return redirect(url)
    except MboxFile.DoesNotExist:
        return Response({'error': 'File not found'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=500)


# Merge two or more persons together ###############################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def merge_persons(request, person_id):

    # Check if user is a member of the editors group
    groups = request.user.groups.all()
    if not groups:
        return Response({'error': 'User is not allowed to perform database updates.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    if not groups.filter(name=settings.MBOX_EDITORS_GROUP).exists():
        return Response({'error': 'User is not allowed to perform database updates.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    persons_list = request.data
    if not isinstance(persons_list, list) or not all(isinstance(i, int) for i in persons_list):
        return Response({"error": "Invalid input. Expected a list of integers."},
                            status=status.HTTP_400_BAD_REQUEST)
    placeholders = ', '.join(['%s'] * len(persons_list))

    # Link the faces from the other persons to the identified person
    query = f"""
        UPDATE mbox_face SET person_id = %s
        WHERE person_id IN ({placeholders})
    """

    with connection.cursor() as cursor:
        cursor.execute(query, (person_id, *persons_list))
        count = cursor.rowcount

    # De-associate the other persons from the file
    query = f"""
        UPDATE mbox_person SET file_id = NULL
        WHERE person_id IN ({placeholders})
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (*persons_list,))
        count = cursor.rowcount

    old_data = {'person_id':person_id}
    new_data = {'persons_list':persons_list}
    insert_audit(request.user.username,'MERGE PERSONS','mbox_face',person_id,old_data,new_data,get_client_ip(request))

    # Return the number of rows affected
    return Response({'rowcount':count}, status=status.HTTP_200_OK)


# Restore a deleted folder #########################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def restore_folder(request,folder_id):

    if not check_folder_permission(request,folder_id,'restore'):
        return Response({'error':'Permission denied. Write and execute permissions ' \
                        'on the parent folder are required.'}, status=status.HTTP_401_UNAUTHORIZED)

    folder = get_object_or_404(MboxFolder, folder_id=folder_id)

    if not folder.is_deleted:
        return Response({'error':'Folder is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)

    parent = get_object_or_404(MboxFolder, folder_id=folder.parent_id)
    if parent.is_deleted:
        return Response({'error':f'Cannot restore to a deleted parent folder: {parent.path_name}'},
                            status=status.HTTP_400_BAD_REQUEST)

    try:
        folder.is_deleted = False
        folder.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    insert_audit(request.user.username,'RESTORE','mbox_folder',folder_id,None,None,get_client_ip(request))
    update_last_modified(folder_id,'folder')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Restore a deleted file ###########################################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def restore_file(request,file_id):

    if not check_file_permission(request,file_id,'restore'):
        return Response({'error':'Permission denied. Write permission on the parent folder is required.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    file = get_object_or_404(MboxFile, file_id=file_id)

    if not file.is_deleted:
        return Response({'error':'File is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)

    folder = get_object_or_404(MboxFolder, folder_id=file.folder_id)
    if folder.is_deleted:
        return Response({'error':f'Cannot restore to a deleted parent folder: {folder.path_name}'},
                            status=status.HTTP_400_BAD_REQUEST)

    try:
        file.is_deleted = False
        file.save()
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    insert_audit(request.user.username,'RESTORE','mbox_file',file_id,None,None,get_client_ip(request))
    update_last_modified(file_id,'file')

    return Response({'result':'success'}, status=status.HTTP_200_OK)


# Upload a file ####################################################################################
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def upload_file(request,folder_id):

    # Check if the user has permission to add a file to the folder
    if not check_folder_permission(request,folder_id,'add'):
        return Response({'error':'Permission denied. Write permission on the folder is required.'},
                            status=status.HTTP_401_UNAUTHORIZED)


    if 'file' not in request.FILES:
        return Response({'error':'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)

    uploaded_file = request.FILES['file']
    if uploaded_file.size > 4 * 1024 *1024 * 1024: # 4GB Limit
        return Response({'error':'File too large. Maximum file size is 4GB.'},
                            status=status.HTTP_400_BAD_REQUEST)

    metadata = json.loads(request.data.get('metadata', '{}'))

    video_exts = ['.mov','.mp4','.avi','.webm','.ogg','.mkv','.wmv','.flv']
    audio_exts = ['.aac','.aiff','.flac','.m4a','.mp3','.raw','.vox','.wav','.wma']
    image_exts = ['.bmp','.jpeg','.jpg','.png','.gif','.jp2','.ico','.tif','.tiff','.svg']
    doc_exts = ['.doc','.docx','.odt','.pdf','.rtf','.txt','.csv','.xls','.xlsx','.ods','.ppt','.pptx','.odp']
    allowed_extensions = video_exts + audio_exts + image_exts + doc_exts

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in allowed_extensions:
        return Response({'error':f'File type {ext} not allowed.'},
                            status=status.HTTP_400_BAD_REQUEST)

    media_type = 'Unknown'
    if ext in video_exts:
        media_type = 'video'
    elif ext in audio_exts:
        media_type = 'audio'
    elif ext in image_exts:
        media_type = 'photo'
    elif ext in doc_exts:
        media_type = 'document'

    path_file = os.path.join(settings.UPLOADS_DIRECTORY,request.user.username)
    path_file = os.path.join(path_file,uploaded_file.name)

    try:
        filename = default_storage.save(path_file, uploaded_file)
        full_path = os.path.join(settings.MEDIA_ROOT, filename)
    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    ip_addr = get_client_ip(request)
    file = None
    try:
        folder = get_object_or_404(MboxFolder, folder_id=folder_id)
        file = MboxFile(
            folder_id=folder_id,
            name=uploaded_file.name,
            extension=ext[1:],
            media_type=media_type,
            media_source=media_type,
            size=uploaded_file.size,
            owner_id=request.user.id,
            owner_name=request.user.username,
            group_id=folder.group_id,
            group_name=folder.group_name,
            owner_rights=folder.owner_rights,
            group_rights=folder.group_rights,
            domain_rights=folder.domain_rights,
            public_rights=folder.public_rights,
            ip_location=ip_addr,
            disabled=True,
            status='for upload'
        )
        file.save() # This should somehow trigger an event that will start the AI processing

    except Exception as e:
        return Response({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Upload the temporary file to the permanent storage
    upload_to_storage(file.file_id, full_path)

    return Response({'result':'success','file_id':f'{file.file_id}'}, status=status.HTTP_200_OK)


# Update a field of a file in the mbox_file table ###################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def update_file(request, file_id):

    # Check if the user has permission to update the file record
    if not check_file_permission(request,file_id,'update'):
        return Response({'error':'Permission denied.'},
                            status=status.HTTP_401_UNAUTHORIZED)

    # Get file record
    row = get_object_or_404(MboxFile, file_id=file_id)

    try:
        data = request.data
        if not data:
            return Response({'error': 'No data provided'}, status=400)

        # Check if the field being updated is allowed
        allowed_fields = ['extension','media_type','media_source','description','tags','texts','remarks',
                          'attributes','extra_data','people','places','title','creator','subject',
                          'publisher','contributor','identifier','language','relation','coverage',
                          'rights','status']
        for field, value in data.items():
            if not field in allowed_fields:
                return Response({'error':f'{field} is not an editable field.'},
                                    status=status.HTTP_400_BAD_REQUEST)

        old_data = {}
        new_data = {}
        updated_fields = []

        for field, value in data.items():
            try:
                # Check if the field exists in the model
                MboxFile._meta.get_field(field)
                old_data[field] = getattr(row, field)
                setattr(row, field, value)
                new_data[field] = value
                updated_fields.append(field)
            except FieldDoesNotExist:
                # If the field doesn't exist, throw an error
                return Response({'error': f'Invalid field: {field}'}, status=400)

        if updated_fields:
            row.save(update_fields=updated_fields)
            # Insert audit record, update last_modified
            insert_audit(request.user.username,'UPDATE','mbox_file',file_id,old_data,new_data,get_client_ip(request))
            update_last_modified(file_id)

            # If the description field changed, update the corresponding embedding
            if 'description' in updated_fields:
                update_text_embedding(file_id,'S',None,new_data['description'])

            return Response({
                'message': f'Metadata updated for file {file_id}',
                'update_fields': updated_fields
            })

        else:
            return Response({'message': 'No valid fields were provided for update.'}, status=400)

    except Exception as e:
        return Response({'error': str(e)}, status=400)


# Update a field(s) of a folder in the mbox_folder table ###########################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def update_folder(request,folder_id):

    # Check if the user has permission to do an update on the folder
    if not check_folder_permission(request,folder_id,'update'):
        return Response({'error':'Permission denied.'})

    # Get file record
    row = get_object_or_404(MboxFolder, folder_id=folder_id)

    try:
        data = request.data
        if not data:
            return Response({'error': 'No data provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if the field being updated is allowed
        allowed_fields = ['description','remarks','extra_data']
        for field, value in data.items():
            if not field in allowed_fields:
                return Response({'error':f'{field} is not an editable field.'},
                                    status=status.HTTP_400_BAD_REQUEST)

        old_data = {}
        new_data = {}
        updated_fields = []

        for field, value in data.items():
            try:
                # Check if the field exists in the model
                MboxFolder._meta.get_field(field)
                old_data[field] = getattr(row, field)
                setattr(row, field, value)
                new_data[field] = value
                updated_fields.append(field)
            except FieldDoesNotExist:
                # If the field doesn't exist, throw an error
                return Response({'error': f'Invalid field: {field}'}, status=status.HTTP_400_BAD_REQUEST)

        if updated_fields:
            row.save(update_fields=updated_fields)
            # Insert audit record, update last_modified
            insert_audit(request.user.username, 'UPDATE', 'mbox_folder', folder_id,
                         old_data, new_data, get_client_ip(request))
            update_last_modified(folder_id, 'folder')
            return Response({
                'message': f'Metadata updated for file {folder_id}',
                'update_fields': updated_fields
            })
        else:
            return Response({'message': 'No valid fields were provided for update.'}, 
                                status=status.HTTP_400_BAD_REQUEST)

    except Exception as e:
        return Response({'error': str(e)}, status=400)


# Update a field of a person in the mbox_person table ###############################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def update_person(request, person_id):

    # Check if user is a member of the editors group
    groups = request.user.groups.all()
    if not groups:
        return Response({'error': 'User is not allowed to perform database updates.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    if not groups.filter(name=settings.MBOX_EDITORS_GROUP).exists():
        return Response({'error': 'User is not allowed to perform database updates.'},
                        status=status.HTTP_401_UNAUTHORIZED)

    # Get file record
    try:
        row = get_object_or_404(MboxPerson, person_id=person_id)
        data = request.data
        if not data:
            return Response({'error': 'No data provided'}, status=HTTP_400_BAD_REQUEST)

        old_data = {}
        new_data = {}
        updated_fields = []

        for field, value in data.items():
            try:
                # Check if the field exists in the model
                MboxPerson._meta.get_field(field)
                old_data[field] = getattr(row, field)
                setattr(row, field, value)
                new_data[field] = value
                updated_fields.append(field)
            except FieldDoesNotExist:
                # If the field doesn't exist, throw an error
                return Response({'error': f'Invalid field: {field}'}, status=HTTP_400_BAD_REQUEST)
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if updated_fields:
            row.save(update_fields=updated_fields)
            # Insert audit record
            insert_audit(request.user.username, 'UPDATE', 'mbox_person', person_id,
                         old_data, new_data, get_client_ip(request))
            return Response({
                'message': f'Fields updated for person {person_id}',
                'update_fields': updated_fields
            })
        else:
            return Response({'message': 'No valid fields were provided for update.'},
                            status=status.HTTP_400_BAD_REQUEST)

    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Update a segment of the transcript of a file #####################################################
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
@validate_subscription_headers
def update_transcript_segment(request, file_id):

    # Check if the user has permission to update the file record
    if not check_file_permission(request,file_id,'update'):
        return Response({'error':'Permission denied. Write permission on the file is required.'},
                            status=status.HTTP_401_UNAUTHORIZED)

    try:
        data = request.data
        timeref = data['timeref'].strip()
        oldstr = timeref + '\n' + data['oldstr'].strip() + '\n\n'
        newstr = timeref + '\n' + data['newstr'].strip() + '\n\n'
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    if oldstr == newstr:
        return Response({'error': 'Old data and new data are identical.'}, status=status.HTTP_400_BAD_REQUEST)

    query = """
        UPDATE mbox_file SET webvtt = REPLACE(webvtt,%s,%s)
        WHERE POSITION(%s IN webvtt) > 0 AND file_id = %s
    """
    with connection.cursor() as cursor:
        cursor.execute(query, (oldstr,newstr,oldstr,file_id,))
        count = cursor.rowcount

    # Insert audit record, update last modified
    old_data = {'webvtt-cue':oldstr}
    new_data = {'webvtt-cue':newstr}
    insert_audit(request.user.username,'UPDATE','mbox_file',file_id,old_data,new_data,get_client_ip(request))
    update_last_modified(file_id)

    # Update the corresponding embedding
    update_text_embedding(file_id,'T',timeref,data['newstr'],data['oldstr'])

    # Return the number of rows affected
    return Response({'rowcount':count}, status=status.HTTP_200_OK)

