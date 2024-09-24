# Base image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MBOX_LOG_DIRECTORY='/home/jose/Source/MediaBox/logs/'

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    netcat-openbsd \
    libgl1-mesa-glx \
    libglib2.0-0 \
    ffmpeg

# Install dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copy project files to the container
COPY . /app/

# Collect static files
RUN python manage.py collectstatic --noinput

# Expose the port your app will run on
EXPOSE 8000

# Command to run Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "facebox_api.wsgi:application", "--workers", "3"]

