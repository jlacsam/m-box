#!/bin/bash

# AUTH_ADFS
# CLIENT_ID: Home > Entra ID > Manage > App registrations > [your app] > Application (client) ID
export AZURE_CLIENT_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

# TENANT_ID: Home > Entra ID > Tenant ID
export AZURE_TENANT_ID='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

# CLIENT_SECRET: Home > Entra ID > Manage > App registrations > [your app] > Manage > Certificates & secrets > Value
export AZURE_CLIENT_SECRET='XXXXX~XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

# Azure Blob Storage Access
# AZURE_CONNECTION_STRING: Home > [your blob storage] > Security + networking > Access keys > Connection string
export AZURE_CONNECTION_STRING='DefaultEndpointsProtocol=https;AccountName=medialib;AccountKey=XFv/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX==;EndpointSuffix=core.windows.net'

# AWS S3 Access
export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_STORAGE_BUCKET_NAME='mbox-demo'
export AWS_SECRET_ACCESS_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
export AWS_ACCESS_KEY_ID=XXXXXXXXXXXXXXXXXXXXXXX

# FaceNet and USE CMLM Models
export KERAS_HOME=/home/jose/Workspaces/mbox/frontend/models
export USE_CMLM_HOME=/home/jose/Workspaces/mbox/frontend/models

# REDIR_URI: http://<ip address:port>/oauth2/callback
export MBOX_REDIR_URI='http://localhost:8000/oauth2/callback'

# MBOX_EDITORS_GROUP: Home > Entra ID > Groups > [your group] > Object ID
#export MBOX_EDITORS_GROUP='20a6b3e3-fe60-4c00-a09d-2061dab62dd9'
export MBOX_EDITORS_GROUP='editors'
export MBOX_SUPERVISORS_GROUP='supervisors'
export MBOX_DEVELOPERS_GROUP='developers'

# UPLOADS DIRECTORY for upload files via web interface
# MUST specify a path that is relative to MEDIA_ROOT
export MBOX_UPLOADS_DIRECTORY='./uploads'

# DATABASE
export MBOX_DB_NAME=mbox_demo
export MBOX_DB_USER=postgres
export MBOX_DB_PASS=password
export MBOX_DB_HOST=localhost
export MBOX_DB_PORT=5432

# MEDIA STORAGE for blobs, thumbnails and log directory
export MBOX_MEDIA_ROOT='/home/jose/Workspaces/mbox/frontend/thumbnails/'
export MBOX_LOG_DIRECTORY='/home/jose/Workspaces/mbox/frontend/logs/'
export MBOX_BLOB_STORAGE='/home/jose/Workspaces/mbox/frontend/blobs/'

# LOGGERS
export MBOX_LOG_SIZE=67108864
export MBOX_ROOT_LOGLEVEL='WARNING'
export MBOX_DJANGO_LOGLEVEL='INFO'
export MBOX_REQUEST_LOGLEVEL='ERROR'
export MBOX_BACKENDS_LOGLEVEL='DEBUG'
export MBOX_APP_LOGLEVEL='INFO'

# Other Django settings variables
export MBOX_DEBUG=True
export MBOX_ALLOWED_HOSTS=localhost
export MBOX_URL_EXPIRATION=86400
export MBOX_MAX_FILES_PER_STORAGE_BUCKET=1000

# s3 or local
export MBOX_TARGET_STORAGE=local
