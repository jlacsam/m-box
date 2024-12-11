import os

from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.contrib.auth.models import Group
from django.http import JsonResponse
from django.core.files.storage import default_storage

from .utils import get_client_ip

# Check Folder Permissions #####################################################
def check_folder_permission(request,folder_id,action):
    folder = get_object_or_404(FbxFolder, folder_id=folder_id)
    user = request.user
    groups = request.user.groups.all()

    if action == 'list': # List the contents of the folder
        if folder.public_rights & 4 and folder.public_rights & 1: # r-x : list filenames and details
            return True
        if user: # User exists in the domain
            if folder.domain_rights & 4 and folder.domain_rights & 1:
                return True
        if groups.filter(name=folder.group_name).exists():
            if folder.group_rights & 4 and folder.group_rights & 1:
                return True
        if folder.owner_name.lower() == user.username.lower():
            if folder.owner_rights & 4 and folder.owner_rights & 1: 
                return True

    if action == 'update' || action == 'rename' || action == 'add': # Update metadata, rename or add folder/file
        if folder.public_rights & 2 and folder.public_rights & 1: # -wx
            return True
        if user: # User exists in the domain
            if folder.domain_rights & 2 and folder.domain_rights & 1:
                return True
        if groups.filter(name=folder.group_name).exists():
            if folder.group_rights & 2 and folder.group_rights & 1:
                return True
        if folder.owner_name.lower() == user.username.lower():
            if folder.owner_rights & 2 and folder.owner_rights & 1: 
                return True

    if action == 'delete' || action == 'restore':
        parent = get_object_or_404(FbxFolder, folder_id=folder.parent_id)
        if parent.public_rights & 2 and parent.public_rights & 1 and 
            folder.public_rights & 2 and folder.public_rights & 1: # -wx
            return True
        if user: # User exists in the domain
            if parent.domain_rights & 2 and parent.domain_rights & 1
                folder.domain_rights & 2 and folder.domain_rights & 1: # -wx
                return True
        if groups.filter(name=parent.group_name).exists():
            if parent.group_rights & 2 and parent.group_rights & 1
                folder.group_rights & 2 and folder.group_rights & 1: # -wx
                return True
        if parent.owner_name.lower() == user.username.lower():
            if parent.owner_rights & 2 and parent.owner_rights & 1
                folder.owner_rights & 2 and folder.owner_rights & 1: # -wx
                return True

    return False


# Check File Permissions #####################################################
def check_file_permission(request,file_id,action):
    file = get_object_or_404(FbxFile, file_id=file_id)
    folder = get_object_or_404(FbxFolder, folder_id=file.folder_id)
    user = request.user
    groups = request.user.groups.all()

    # Unix systems require execute permission on the entire tree but
    # we will relax that rule. Execute permission on the parent is enough.
    has_execute = False 
    if folder.public_rights & 1: # --x
        has_execute = True
    if user: # User exists in the domain
        if folder.domain_rights & 1:
            has_execute = True
    if groups.filter(name=folder.group_name).exists():
        if folder.group_rights & 1:
            has_eexecute = True
    if folder.owner_name.lower() == user.username.lower():
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
        if groups.filter(name=file.group_name).exists():
            if file.group_rights & 4:
                return True
        if file.owner_name.lower() == user.username.lower():
            if file.owner_rights & 4: 
                return True

    if action == 'update' || action == 'rename':
        if file.public_rights & 2: # r--
            return True
        if user: # User exists in the domain
            if file.domain_rights & 2:
                return True
        if groups.filter(name=file.group_name).exists():
            if file.group_rights & 2:
                return True
        if file.owner_name.lower() == user.username.lower():
            if file.owner_rights & 2: 
                return True

    return JsonResponse({'result':'false'})


# Create Folder ################################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def create_folder(request,parent_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')
    name = request.headers.get('Name')
    description = request.headers.get('Description')
    remarks = request.headers.get('Remarks')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    if not check_folder_permission(request,parent_id,'add'):
        return JsonResponse({'error':'Permission denied.'})

    try:
        parent = get_object_or_404(FbxFolder, folder_id=parent_id)
        folder = FbxFolder(
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
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':f'{folder.folder_id}'}, status=status.HTTP_200_OK)


# Rename Folder ################################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def rename_folder(request,folder_id,name):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    if not check_folder_permission(request,folder_id,'rename'):
        return JsonResponse({'error':'Permission denied.'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        old_path_name = folder.path_name
        folder.name = name
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Update the path of all of its children folders
    # Only update the path. The trigger will take care of the path_name.
    query = f"""
        UPDATE mbox_folder
        SET path = %s
        WHERE path LIKE %s
    """
    TO DO

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Rename File ##################################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def rename_file(request,file_id,name):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    if not check_file_permission(request,file_id,'rename'):
        return JsonResponse({'error':'Permission denied.'})

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        file.name = name
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Set Folder Owner #############################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def set_folder_owner(request,folder_id,owner_name):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        if not request.user.is_superuser:
            if request.user.username.lower() != folder.owner_name.lower():
                return JsonResponse({'error':'Permission denied.'})

        new_owner = User.objects.get(username=owner_name)
        folder.owner_id = new_owner.id
        folder.owner_name = owner_name
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Set File Owner ###############################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def set_file_owner(request,file_id,owner_name):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        if not request.user.is_superuser:
            if request.user.username.lower() != file.owner_name.lower():
                return JsonResponse({'error':'Permission denied.'})

        new_owner = User.objects.get(username=owner_name)
        file.owner_id = new_owner.id
        file.owner_name = owner_name
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Set Folder Group #############################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def set_folder_group(request,folder_id,group_name):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        if not request.user.is_superuser:
            if request.user.username.lower() != folder.owner_name.lower():
                return JsonResponse({'error':'Permission denied.'})

        new_group = Group.objects.get(name='group_name')
        folder.group_id = new_group.id
        folder.group_name = group_name
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Set File Group ###############################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def set_file_group(request,file_id,group_name):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        if not request.user.is_superuser:
            if request.user.username.lower() != file.owner_name.lower():
                return JsonResponse({'error':'Permission denied.'})

        new_group = Group.objects.get(name='group_name')
        file.group_id = new_group.id
        file.group_name = group_name
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Set Folder Permission ########################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def set_folder_permission(request,folder_id,owner_rights,group_rights,domain_rights,public_rights):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        if not request.user.is_superuser:
            if request.user.username.lower() != folder.owner_name.lower():
                return JsonResponse({'error':'Permission denied.'})

        folder.owner_rights = owner_rights
        folder.group_rights = group_rights
        folder.domain_rights = domain_rights
        folder.public_rights = public_rights
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Set File Permission ##########################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def set_file_permission(request,file_id,owner_rights,group_rights,domain_rights,public_rights):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        if not request.user.is_superuser:
            if request.user.username.lower() != file.owner_name.lower():
                return JsonResponse({'error':'Permission denied.'},
                                    status=status.HTTP_401_UNAUTHORIZED)

        file.owner_rights = owner_rights
        file.group_rights = group_rights
        file.domain_rights = domain_rights
        file.public_rights = public_rights
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR) 

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def move_folder(request,folder_id,target_folder):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        folder.parent_id = target_folder
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # TO DO
    # Update paths of all children

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Move file from one folder to another #########################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def move_file(request,file_id,target_folder):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        file.folder_id = target_folder
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Mark a folder record as deleted ##############################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def delete_folder(request,folder_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    query = "SELECT COUNT(*) FROM mbox_file WHERE folder_id = %s AND NOT is_deleted"
    with connection.cursor() as cursor:
        cursor.execute(query, (folder_id,))
        count = cursor.fetchone()[0]

    if count > 0:
        return JsonResponse({'error':'Folder is not empty.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        # Append the folder_id to the name so that inserting new folders with the same name
        # to the same folder won't violate the unique constraint (path,name)
        folder.name += f"({folder_id})"
        folder.is_deleted = True
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # No need to delete the entire folder tree because of the requirement above:
    # The folder must be empty in order to be deleted.

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Mark a file record as deleted ################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def delete_file(request,file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        # Append the file_id to the name so that inserting new files with the same name
        # to the same folder won't violate the unique constraint (folder_id,name)
        file.name += f"({file_id})"
        file.is_deleted = True
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Restore a deleted folder #####################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def restore_folder(request,folder_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        parent = get_object_or_404(FbxFolder, folder_id=folder.parent_id)
        if parent.is_deleted:
            return JsonResponse({'error':f'Cannot restore to a deleted parent folder: {parent.path_name}'},
                                status=status.HTTP_400_BAD_REQUEST)

        folder.is_deleted = False
        folder.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Restore a deleted file #######################################################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def restore_file(request,file_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        file = get_object_or_404(FbxFile, file_id=file_id)
        folder = get_object_or_404(FbxFolder, folder_id=file.folder_id)
        if folder.is_deleted:
            return JsonResponse({'error':f'Cannot restore to a deleted parent folder: {folder.path_name}'},
                                status=status.HTTP_400_BAD_REQUEST)

        file.is_deleted = False
        file.save()
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success'}, status=status.HTTP_200_OK)


# Upload a file ################################################################
@require_http_methods(['POST'])
@permission_classes([IsAuthenticated])
def upload_file(request,folder_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return JsonResponse({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    if 'file' not in request.FILES:
        return JsonResponse({'error':'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)

    uploaded_file = request.FILES['file']
    if uploaded_file.size > 4 * 1024 *1024 * 1024: # 4GB Limit
        return JsonResponse({'error':'File too large. Maximum file size is 4GB.'},
                            status=status.HTTP_400_BAD_REQUEST)


    video_exts = ['.mov','.mp4','.avi','.webm','.ogg','.mkv','.wmv','.flv']
    audio_exts = ['.aac','.aiff','.flac','.m4a','.mp3','.raw','.vox','.wav','.wma']
    image_exts = ['.bmp','.jpeg','.jpg','.png','.gif','.jp2','.ico','.tif','.tiff','.svg']
    doc_exts = ['.doc','.docx','.odt','.pdf','.rtf','.txt','.csv','.xls','.xlsx','.ods','.ppt','.pptx','.odp']
    allowed_extensions = video_exts + audio_exts + image_exts + doc_exts

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    if ext not in allowed_extensions:
        return JsonResponse({'error':f'File type {ext} not allowed.'},
                            status=status.HTTP_400_BAD_REQUEST)

    media_type = 'Unknown'
    if ext in video_exts:
        media_type = 'video'
    elif ext in audio_exts:
        media_type = 'audio'
    elif ext in image_exts:
        media_type = 'image'
    elif ext in doc_exts:
        media_type = 'document'

    path_file = os.path.join(settings.UPLOADS_DIRECTORY,request.user.username)
    path_file = os.path.join(path_file,uploaded_file.name)
    filename = default_storage.save(path_file, uploaded_file)
    ip_addr = get_client_ip(request)

    file = None
    try:
        folder = get_object_or_404(FbxFolder, folder_id=folder_id)
        file = FbxFile(
            folder_id=folder_id,
            name=uploaded_file.name,
            extension=ext[1:],
            media_type=media_type,
            size=uploaded_file.size,
            owner_id=request.user.id
            owner_name=request.user.username,
            group_id=folder.group_id,
            group_name=folder.group_name,
            owner_rights=folder.owner_rights,
            group_rights=folder.group_rights,
            domain_rights=folder.domain_rights,
            public_rights=folder.public_rights,
            ip_location=ip_addr,
            status='NEW'
        )
        file.save() # This should somehow trigger an event that will start the AI processing
    except Exception as e:
        return JsonResponse({'error':f'{e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return JsonResponse({'result':'success','file_id':f'{file.file_id}'}, status=status.HTTP_200_OK)


# Update a field(s) of a folder in the mbox_folder table #######################
@require_http_methods(['PATCH'])
@permission_classes([IsAuthenticated])
def update_folder(request,folder_id):
    # Extract and validate subscription ID and client secret
    subscription_id = request.headers.get('Subscription-ID')
    client_secret = request.headers.get('Client-Secret')

    # Check if client app has a valid subscription
    if not subscription_id or not client_secret or not validate_subscription(subscription_id, client_secret):
        return Response({'error': f"Invalid subscription ID {subscription_id} or client secret {client_secret}"}, status=status.HTTP_401_UNAUTHORIZED)

    # Check if user is a member of the editors group
    groups = request.user.groups.all()
    if not groups.filter(name=settings.MBOX_EDITORS_GROUP).exists():
        return Response({'error': 'User is not allowed to perform database updates.'}, status=status.HTTP_401_UNAUTHORIZED)

    # Get file record
    try:
        row = get_object_or_404(FbxFolder, folder_id=folder_id)
        data = json.loads(request.body)

        if not data:
            return JsonResponse({'error': 'No data provided'}, status=status.HTTP_400_BAD_REQUEST)

        old_data = {}
        new_data = {}
        updated_fields = []

        for field, value in data.items():
            try:
                # Check if the field exists in the model
                FbxFolder._meta.get_field(field)
                old_data[field] = getattr(row, field)
                setattr(row, field, value)
                new_data[field] = value
                updated_fields.append(field)
            except FieldDoesNotExist:
                # If the field doesn't exist, throw an error
                return JsonResponse({'error': f'Invalid field: {field}'}, status=status.HTTP_400_BAD_REQUEST)

        if updated_fields:
            row.save(update_fields=updated_fields)
            # Insert audit record, update last_modified
            insert_audit(request.user.username,'UPDATE','mbox_folder',file_id,old_data,new_data,get_client_ip(request))
            update_last_modified(folder_id) # TO DO implement for mbox_folder
            return JsonResponse({
                'message': f'Metadata updated for file {file_id}',
                'update_fields': updated_fields
            })
        else:
            return JsonResponse({'message': 'No valid fields were provided for update.'}, 
                                status=status.HTTP_400_BAD_REQUEST)

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON in request body'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

