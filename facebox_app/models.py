# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models
from django.utils import timezone

class FbxAudit(models.Model):
    audit_id = models.BigAutoField(primary_key=True)
    activity = models.CharField(max_length=64)
    event_timestamp = models.DateTimeField(default=timezone.now)
    location = models.CharField(max_length=20, blank=True, null=True)
    table_name = models.CharField(max_length=16, blank=True, null=True)
    record_id = models.IntegerField(blank=True, null=True)
    old_data = models.JSONField()
    new_data = models.JSONField()
    username = models.CharField(max_length=128)
    remarks = models.CharField(max_length=512, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mbox_audit'


class FbxFace(models.Model):
    face_id = models.BigAutoField(primary_key=True)
    file = models.ForeignKey('FbxFile', models.DO_NOTHING)
    person = models.ForeignKey('FbxPerson', models.DO_NOTHING, blank=True, null=True)
    similarity = models.FloatField(blank=True, null=True)
    time_start = models.FloatField()
    time_end = models.FloatField()
    box = models.JSONField()
    pose = models.JSONField()
    quality = models.JSONField()
    gender = models.JSONField()
    age_range = models.JSONField()
    confidence = models.FloatField()
    embedding = models.TextField(blank=True, null=True)  # This field type is a guess.
    merged_to = models.BigIntegerField(blank=True, null=True)
    thumbnail_id = models.IntegerField(blank=True, null=True)
    thumbnail_offset = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mbox_face'

    def __str__(self):
        return f"{str(self.file.file_id).zfill(6)}_{str(self.face_id).zfill(6)}_{self.confidence:.0f}.jpg"
    def thumbnail(self):
        return f"{str(self.file.file_id).zfill(6)}_{str(self.face_id).zfill(6)}.jpg"


class FbxFile(models.Model):
    file_id = models.AutoField(primary_key=True)
    folder = models.ForeignKey('FbxFolder', models.DO_NOTHING)
    name = models.CharField(max_length=64)
    extension = models.CharField(max_length=16)
    media_type = models.CharField(max_length=16, blank=True, null=True)
    media_source = models.CharField(max_length=16, blank=True, null=True)
    size = models.BigIntegerField()
    file_url = models.TextField(blank=True, null=True)
    archive_url = models.TextField(blank=True, null=True)
    date_created = models.DateTimeField()
    date_uploaded = models.DateTimeField()
    is_deleted = models.BooleanField()
    description = models.TextField(blank=True, null=True)
    tags = models.TextField(blank=True, null=True)
    texts = models.TextField(blank=True, null=True)
    date_deleted = models.DateTimeField(blank=True, null=True)
    last_accessed = models.DateTimeField(blank=True, null=True)
    last_modified = models.DateTimeField(blank=True, null=True)
    owner_id = models.IntegerField(blank=True, null=True)
    owner_name = models.CharField(max_length=64, blank=True, null=True)
    group_id = models.IntegerField(blank=True, null=True)
    group_name = models.CharField(max_length=64, blank=True, null=True)
    owner_rights = models.SmallIntegerField()
    group_rights = models.SmallIntegerField()
    domain_rights = models.SmallIntegerField()
    public_rights = models.SmallIntegerField()
    hash = models.CharField(max_length=32, blank=True, null=True)
    ip_location = models.CharField(max_length=15, blank=True, null=True)
    page_count = models.IntegerField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    version = models.SmallIntegerField()
    attributes = models.JSONField(blank=True, null=True)
    extra_data = models.JSONField(blank=True, null=True)
    people = models.TextField(blank=True, null=True)
    places = models.TextField(blank=True, null=True)
    webvtt = models.TextField(blank=True, null=True)
    thumbnail_id = models.IntegerField(blank=True, null=True)
    thumbnail_offset = models.IntegerField(blank=True, null=True)
    status = models.CharField(max_length=20, blank=True, null=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    creator = models.CharField(max_length=255, blank=True, null=True)
    subject = models.CharField(max_length=255, blank=True, null=True)
    publisher = models.CharField(max_length=255, blank=True, null=True)
    contributor = models.CharField(max_length=255, blank=True, null=True)
    identifier = models.CharField(max_length=255, blank=True, null=True)
    language = models.CharField(max_length=255, blank=True, null=True)
    relation = models.CharField(max_length=255, blank=True, null=True)
    coverage = models.CharField(max_length=255, blank=True, null=True)
    rights = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mbox_file'


class FbxFolder(models.Model):
    folder_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=64)
    path = models.CharField(max_length=2048)
    path_name = models.CharField(max_length=2112)
    size = models.BigIntegerField()
    date_created = models.DateTimeField()
    is_deleted = models.BooleanField()
    folder_level = models.SmallIntegerField()
    description = models.TextField(blank=True, null=True)
    last_accessed = models.DateTimeField(blank=True, null=True)
    last_modified = models.DateTimeField(blank=True, null=True)
    owner_id = models.IntegerField(blank=True, null=True)
    owner_name = models.CharField(max_length=64, blank=True, null=True)
    group_id = models.IntegerField(blank=True, null=True)
    group_name = models.CharField(max_length=64, blank=True, null=True)
    owner_rights = models.SmallIntegerField()
    group_rights = models.SmallIntegerField()
    domain_rights = models.SmallIntegerField()
    public_rights = models.SmallIntegerField()
    stats_as_of = models.DateTimeField(blank=True, null=True)
    subfolder_count = models.IntegerField()
    file_count = models.IntegerField()
    video_count = models.IntegerField()
    audio_count = models.IntegerField()
    photo_count = models.IntegerField()
    reviewed_count = models.IntegerField()
    page_count = models.IntegerField()
    parent_id = models.IntegerField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    schema_id = models.IntegerField(blank=True, null=True)
    extra_data = models.JSONField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mbox_folder'


class FbxPerson(models.Model):
    person_id = models.AutoField(primary_key=True)
    full_name = models.CharField(max_length=128)
    last_name = models.CharField(max_length=64, blank=True, null=True)
    first_name = models.CharField(max_length=64, blank=True, null=True)
    middle_name = models.CharField(max_length=64, blank=True, null=True)
    birth_country = models.CharField(max_length=64, blank=True, null=True)
    birth_city = models.CharField(max_length=64, blank=True, null=True)
    birth_date = models.DateField(blank=True, null=True)
    face = models.TextField(blank=True, null=True)  # This field type is a guess.
    voice = models.TextField(blank=True, null=True)  # This field type is a guess.
    box = models.JSONField(blank=True, null=True)
    pose = models.JSONField(blank=True, null=True)
    quality = models.JSONField(blank=True, null=True)
    gender = models.JSONField(blank=True, null=True)
    age_range = models.JSONField(blank=True, null=True)
    confidence = models.FloatField(blank=True, null=True)
    face_id = models.BigIntegerField(blank=True, null=True)
    voice_id = models.BigIntegerField(blank=True, null=True)
    file_id = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'mbox_person'


class FbxVoice(models.Model):
    voice_id = models.BigAutoField(primary_key=True)
    file = models.ForeignKey(FbxFile, models.DO_NOTHING)
    person = models.ForeignKey(FbxPerson, models.DO_NOTHING, blank=True, null=True)
    speaker = models.CharField(max_length=12)
    time_start = models.FloatField()
    time_end = models.FloatField()
    embedding = models.TextField(blank=True, null=True)  # This field type is a guess.

    class Meta:
        managed = False
        db_table = 'mbox_voice'


class FbxThumbnail(models.Model):
    thumbnail_id = models.AutoField(primary_key=True)
    label = models.CharField(max_length=32)
    path = models.CharField(max_length=255)
    used = models.IntegerField()
    capacity = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'mbox_thumbnail'
