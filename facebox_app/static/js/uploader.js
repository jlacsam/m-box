const SUBSCRIPTION_ID = "00000000";
const CLIENT_SECRET = "00000000";
const INFO_ICON = "\u{1F6C8}";
const VIDEO_OPTIONS = [
    {'Attributes':'Get video attributes such as frame rate, resolution, encoding, audio sampling rate, audio channels, audio bitrate & file size','required':true,'depends':null},
    {'Transcription':'Transcribe the audio content of the video material.','required':false,'depends':null},
    {'Diarization':'Tag unique speakers in the video.','required':false,'depends':'Transcription'},
    {'Synopsis':'Generate a 3-sentence synopsis for the video based on its content.','required':false,'depends':'Transcription'},
    {'People & Places':"List people's names and places mentioned in the video.",'required':false,'depends':'Transcription'},
    {'Chapterization':'Segment the video into logical chapters.','required':false,'depends':'Transcription'},
    {'Faces':'Detect all faces that appear in the video.','required':false,'depends':null},
    {'Thumbnail':'Select a video frame with the most dominant face to represent the video.','required':false,'depends':'Faces'},
    {'Persons':'Tag all unique faces that appear in the video.','required':false,'depends':'Faces'}];
const AUDIO_OPTIONS = [
    {'Attributes':'Get audio attributes such as sampling rate, channels, bitrate, encoding & file size.','required':true,'depends':null},
    {'Transcription':'Transcribe the content of the material.','required':false,'depends':null},
    {'Diarization':'Tag unique speakers in the audio.','required':false,'depends':'Transcription'},
    {'Synopsis':'Generate a 3-sentence synopsis for the audio based on its content.','required':false,'depends':'Transcription'},
    {'People & Places':"List people's name and places mentioned in the audio.",'required':false,'depends':'Transcription'},
    {'Chapterization':'Segment the audio into logical chapters.','required':false,'depends':'Transcription'},
    {'Voices':'Tag all unique voices that are heard in the audio.','required':false,'depends':null}];
const PHOTO_OPTIONS = [
    {'Attributes':'Get photo image attributes such as resolution, bit depth, encoding & file size.','required':true,'depends':null},
    {'Description':'Generate a 1-sentence description of what is contained in the photo image.','required':false,'depends':null},
    {'Texts':'List all texts that appear in the photo image.','required':false,'depends':null},
    {'Tags':'List all objects and scenes that appear in the photo image.','required':false,'depends':null},
    {'Faces':'Detect all faces that appear in the photo image.','required':false,'depends':null},
    {'Persons':'Tag all unique faces that appear in a collection of photos.','required':false,'depends':'Faces'}];
const DOCUMENT_OPTIONS = [
    {'Attributes':'Get document attributes such as file type, number of pages, number of words & file size.','required':true,'depends':null},
    {'Abstract':'Generate a 500-word abstract for the document.','required':false,'depends':null},
    {'Key-Value Pairs':'Identify all key-value pairs that appear in the document.','required':false,'depends':null}];

function concurrentMap(items, fn, concurrency = 3) {
    const results = [];
    const inProgress = new Set();
    let index = 0;

    return new Promise((resolve) => {
        function next() {
            if (index === items.length && inProgress.size === 0) {
                resolve(results);
                return;
            }

            while (inProgress.size < concurrency && index < items.length) {
                const currentIndex = index++;
                const item = items[currentIndex];
                
                const promise = fn(item).then(result => {
                    results[currentIndex] = result;
                    inProgress.delete(promise);
                    next();
                });

                inProgress.add(promise);
            }
        }

        next();
    });
}

class FileUploadModal {
    constructor(folder_id) {
        this.folder_id = folder_id;
        this.files = [];
        this.fileStatuses = {};
        this.uploading = false;
        this.totalBytes = 0;
        this.uploadedBytes = 0;
        this.setupElements();
        this.setupEventListeners();
    }

    setupElements() {
        this.modal = document.getElementById('uploadModal');
        this.targetPath = document.getElementById('targetPath');
        this.closeBtn = document.querySelector('.close');
        this.dropZone = document.getElementById('dropZone');
        this.fileList = document.getElementById('fileList');
        this.uploadButton = document.getElementById('uploadButton');
        this.totalProgress = document.getElementById('totalProgress');
        this.statusMessage = document.getElementById('uploadMessage');
        this.errorMessages = document.getElementById('errorMessages');
    }

    setupEventListeners() {
        this.closeBtn.onclick = () => this.close();
        this.dropZone.ondragover = (e) => this.handleDragOver(e);
        this.dropZone.ondragleave = (e) => this.handleDragLeave(e);
        this.dropZone.ondrop = (e) => this.handleDrop(e);
        this.uploadButton.onclick = () => this.startUpload();

        // Also allow clicking the drop zone to select files
        this.dropZone.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.onchange = (e) => this.handleFileSelect(e.target.files);
            input.click();
        };
    }

    handleDragOver(e) {
        e.preventDefault();
        this.dropZone.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        this.handleFileSelect(files);
    }

    handleFileSelect(fileList) {
        const validFiles = this.validateFiles(fileList);
        this.files = [...this.files, ...validFiles];
        this.updateFileList();
    }

    validateFiles(fileList) {
        const allowedExtensions = [
            '.mov', '.mp4', '.avi', '.webm', '.ogg', '.mkv', '.wmv', '.flv',
            '.aac', '.aiff', '.flac', '.m4a', '.mp3', '.raw', '.vox', '.wav', '.wma',
            '.bmp', '.jpeg', '.jpg', '.png', '.gif', '.jp2', '.ico', '.tif', '.tiff', '.svg',
            '.doc', '.docx', '.odt', '.pdf', '.rtf', '.txt', '.csv', '.xls', '.xlsx', '.ods',
            '.ppt', '.pptx', '.odp'
        ];

        const validFiles = [];
        const invalidFiles = [];

        Array.from(fileList).forEach(file => {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (allowedExtensions.includes(ext)) {
                validFiles.push(file);
            } else {
                invalidFiles.push(file.name);
            }
        });

        if (invalidFiles.length > 0) {
            this.errorMessages.textContent = `Removed unsupported files: ${invalidFiles.join(', ')}`;
        }

        return validFiles;
    }

    updateFileList() {
        this.fileList.innerHTML = '';
        this.totalBytes = 0;

        this.files.forEach((file, index) => {
            this.totalBytes += file.size;
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span>${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                <span class="file-status" data-file="${file.name}">0%</span>
            `;
            this.fileList.appendChild(fileItem);
        });

        this.uploadButton.disabled = this.files.length === 0;
    }

    updateProgress(uploadedBytes, totalBytes) {
        if (totalBytes === 0) return;
        const percentage = (uploadedBytes / totalBytes * 100).toFixed(1);
        this.totalProgress.style.width = `${percentage}%`;
    }

    async startUpload() {
        if (this.files.length === 0) return;

        const query = 'input[type="checkbox"]:checked[id^="cb_"]';
        const checkedBoxes = document.querySelectorAll(query);
        if (!checkedBoxes.length) {
            alert("No selected AI processing option!");
            return;
        }

        this.uploading = true;
        this.statusMessage.textContent = 'Please do not refresh the page while upload is in progress.';
        this.statusMessage.style.display = 'block';
        this.statusMessage.style.backgroundColor = 'orange';
        this.uploadButton.disabled = true;
        this.uploadedBytes = 0;
        this.fileStatuses = {};
        let successfulUploads = 0;

        const options = Array.from(checkedBoxes).map(cb => cb.id.replace('cb_',''));

        // Upload files concurrently with a limit of 3 simultaneous uploads
        const results = await concurrentMap(this.files, async (file) => {
            const success = await this.uploadFile(file, options);
            if (success) successfulUploads++;
            return success;
        }, 3);

        this.uploading = false;
        this.statusMessage.textContent = `Upload completed. ${successfulUploads} of ${this.files.length} files uploaded successfully.`;
        this.statusMessage.style.backgroundColor = 'green';

        this.uploadButton.disabled = false;
        if (successfulUploads === this.files.length) {
            this.uploadButton.textContent = 'Close';
            this.uploadButton.onclick = () => this.close();
        }
    }

    async getFolderInfo() {
        const url = `/api/get-folder/${this.folder_id}/`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-CSRFToken': this.getCsrfToken(),
                    'Content-Type': 'application/json',
                    'Subscription-ID': SUBSCRIPTION_ID,
                    'Client-Secret': CLIENT_SECRET,
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            this.targetPath.textContent = data.results[0].path_name;
        } catch (error) {
            console.error('Error fetching folder:', error);
        }
    }

    async uploadFile(file, options) {
        const formData = new FormData();
        formData.append('file', file);

        const metadata = { 'options':options };
        formData.append('metadata', JSON.stringify(metadata))

        const statusElement = this.fileList.querySelector(`[data-file="${file.name}"]`);

        try {
            const xhr = new XMLHttpRequest();

            await new Promise((resolve, reject) => {
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        // Update individual file progress
                        const filePercentage = (event.loaded / event.total * 100).toFixed(1);
                        statusElement.textContent = `${filePercentage}%`;

                        // Update total progress
                        const previousLoaded = this.fileStatuses[file.name]?.loaded || 0;
                        const deltaLoaded = event.loaded - previousLoaded;
                        this.uploadedBytes += deltaLoaded;
                        this.fileStatuses[file.name] = { loaded: event.loaded };

                        this.updateProgress(this.uploadedBytes, this.totalBytes);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        statusElement.innerHTML = '<span class="success-mark">✓</span>';
                        resolve(true);
                    } else {
                        statusElement.innerHTML = '<span class="error-mark">✗</span>';
                        reject(new Error('Upload failed'));
                    }
                });

                xhr.addEventListener('error', () => {
                    statusElement.innerHTML = '<span class="error-mark">✗</span>';
                    reject(new Error('Upload failed'));
                });

                xhr.open('POST', `/api/upload-file/${this.folder_id}/`);
                xhr.setRequestHeader('X-CSRFToken', this.getCsrfToken());
                xhr.setRequestHeader('Subscription-ID', SUBSCRIPTION_ID);
                xhr.setRequestHeader('Client-Secret', CLIENT_SECRET);
                xhr.send(formData);
            });

            return true;
        } catch (error) {
            return false;
        }
    }

    getCsrfToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]').value;
    }

    show() {
        this.modal.style.display = 'flex';
    }

    close() {
        this.modal.style.display = 'none';
        this.files = [];
        this.fileStatuses = {};
        this.uploading = false;
        this.updateFileList();
        this.totalProgress.style.width = '0%';
        this.statusMessage.style.display = 'none';
        this.errorMessages.textContent = '';
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const uploader = new FileUploadModal(target_folder_id);
    showUploadOptions();
    uploader.getFolderInfo();
    uploader.show();
});

function showUploadOptions() {
    const uploadOptions = document.getElementById('uploadOptions');

    function createOptions(title, options, group) {
        const container = document.createElement('div');
        const titleBox = document.createElement('h3');
        const titleItem = document.createElement('span');
        titleItem.textContent = title;

        const checkAll = document.createElement('input');
        checkAll.type = 'checkbox';
        checkAll.id = `all_cb_${group}`;
        checkAll.onchange = function() {
            const query = `input[type="checkbox"][id^="cb_${group}_"]`;
            const checkedBoxes = document.querySelectorAll(query);
            checkedBoxes.forEach(checkBox => {
                if (!checkBox.disabled) {
                    checkBox.checked = this.checked;
                }
            });
        };

        titleBox.appendChild(checkAll);
        titleBox.appendChild(titleItem);
        container.appendChild(titleBox);

        options.forEach(option => {
            const key = Object.keys(option)[0];
            const value = option[key];
            const sanitizedKey = key.replace(/\s+/g,'').replace('&','_').toLowerCase();

            const indent = document.createElement('span');
            indent.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'cb_' + group + '_' + sanitizedKey;
            checkbox.name = key;
            checkbox.checked = option['required'];
            checkbox.disabled = option['required'];
            checkbox.setAttribute('depends',option['depends']);
            checkbox.onchange = function() {
                if (this.checked) {
                    const depends = document.getElementById(
                        'cb_' + group + '_' + option['depends'].replace(/\s+/g,'').replace('&','_').toLowerCase());
                    depends.checked = true;
                }
            };

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = key;
            label.className = 'checkbox-label';
        
            const tooltip = document.createElement('span');
            tooltip.innerHTML = '&nbsp;' + INFO_ICON;
            tooltip.title = value; // Tooltip text
            tooltip.className = 'checkbox-tooltip';

            const div = document.createElement('div');
            div.appendChild(indent);
            div.appendChild(checkbox);
            div.appendChild(label);
            div.appendChild(tooltip);
            div.className = 'checkbox-div';

            container.appendChild(div);
        });
        return container;
    }
      
    const videoOptions = createOptions('Video', VIDEO_OPTIONS, 'video');
    const audioOptions = createOptions('Audio', AUDIO_OPTIONS, 'audio');
    const photoOptions = createOptions('Photo', PHOTO_OPTIONS, 'photo');
    const documentOptions = createOptions('Document', DOCUMENT_OPTIONS, 'document');

    uploadOptions.appendChild(videoOptions);
    uploadOptions.appendChild(audioOptions);
    uploadOptions.appendChild(photoOptions);
    uploadOptions.appendChild(documentOptions);
}
