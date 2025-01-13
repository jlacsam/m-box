const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';
const FILE_STATUSES = ['For review','Reviewed'];
const APPROVED_STATUS = 'Reviewed';
const INT_MAX = 2147483647;
const FOLDER_ICON = '\u{1F4C1}';
const FOLDER_WIDTH = 20;

let selectedFile = 0;
let selectedFolder = 0;
let editorDiv = null;
let editorText = null;
let editorSelect = null;
let totalFiles = 0;
let maxRows = 10;
let selectedFileName = null;

document.addEventListener('DOMContentLoaded', function() {
    const videosTab = document.getElementById('videos-tab');
    const audiosTab = document.getElementById('audios-tab');
    const videoPlayer = document.getElementById('video-player');
    const audioPlayer = document.getElementById('audio-player');
    const folderBrowser = document.getElementById('folder-browser');

    videoPlayer.addEventListener('play', () => {
        console.log("Video started.");
    });

    audioPlayer.addEventListener('play', () => {
        console.log("Audio started.");
    });

    videoPlayer.addEventListener('timeupdate', () => {
        syncTranscript(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('ended', () => {
        console.log("Video ended.");
    });

    audioPlayer.addEventListener('timeupdate', () => {
        syncTranscript(audioPlayer.currentTime);
    });

    audioPlayer.addEventListener('ended', () => {
        console.log("Audio ended.");
    });

    window.addEventListener('resize', function() {
        const headerDiv = document.getElementById('header');
        const transcriptDiv = document.getElementById('transcript');
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        transcriptDiv.style.maxHeight = (viewportHeight-headerDiv.style.height) + 'px';
    });

    const profileIcon = document.getElementById('profile');
    const popupMenu = document.getElementById('popup-menu');
    profileIcon.addEventListener('click', function(event) {
        if (popupMenu.classList.contains('popup-hidden')) {
            popupMenu.style.top = '65px';
            popupMenu.style.width = '150px';
            popupMenu.style.left = (window.innerWidth - 180) + 'px';
            popupMenu.classList.remove('popup-hidden');
            popupMenu.classList.add('popup-visible');
        } else if (popupMenu.classList.contains('popup-visible')) {
            popupMenu.classList.remove('popup-visible');
            popupMenu.classList.add('popup-hidden');
        }
    });

    popupMenu.addEventListener('mouseleave', function(event) {
        if (popupMenu.classList.contains('popup-visible')) {
            popupMenu.classList.remove('popup-visible');
            popupMenu.classList.add('popup-hidden');
        }
    });

    const settingsIcon = document.getElementById('settings');
    const settingsMenu = document.getElementById('settings-menu');
    settingsIcon.addEventListener('click', function(event) {
        if (settingsMenu.classList.contains('popup-hidden')) {
            settingsMenu.style.top = '65px';
            settingsMenu.style.width = '150px';
            settingsMenu.style.left = (window.innerWidth - 180) + 'px';
            settingsMenu.classList.remove('popup-hidden');
            settingsMenu.classList.add('popup-visible');
        } else if (settingsMenu.classList.contains('popup-visible')) {
            settingsMenu.classList.remove('popup-visible');
            settingsMenu.classList.add('popup-hidden');
        }
    });

    settingsMenu.addEventListener('mouseleave', function(event) {
        if (settingsMenu.classList.contains('popup-visible')) {
            settingsMenu.classList.remove('popup-visible');
            settingsMenu.classList.add('popup-hidden');
        }
    });

    folderBrowser.addEventListener('mouseleave', function(Event) {
        if (folderBrowser.classList.contains('folder-browser-visible')) {
            folderBrowser.classList.remove('folder-browser-visible');
            folderBrowser.classList.add('folder-browser-hidden');
        }
    });

    if (q_file_name == 'video') {
        videosTab.style.color = '#ffffff';
    }

    if (q_file_name == 'audio') {
        audiosTab.style.color = '#ffffff';
    }

    const editables = document.getElementsByClassName('detail_editable');
    Array.from(editables).forEach(editable => {
        if (editable.id == 'detail-status') {
            editable.addEventListener('dblclick', () => showEditor(editable,'select',FILE_STATUSES))
        } else {
            editable.addEventListener('dblclick', () => showEditor(editable,'textarea'))
        }
    });

    document.getElementById('editor-select').addEventListener('change', function(event) {
        if (editorText) {
            editorText.value = event.target.value;
        }
    });

    getGroups();

    if (parseInt(q_file_id) > 0) {
        selectedFile = q_file_id;
        selectedFileName = q_file_name;
        getMedia(selectedFile);
    }
});

function getGroups() {
    const csrftoken = getCookie('csrftoken');
    fetch('/api/get-groups/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        displayGroups(data.groups);
        if (data.groups.includes('Editors')) {
            isEditor = true;
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function displayGroups(groups) {
    const userGroups = document.getElementById('user-groups');
    let html = `<p class='groups-label'>Groups</p>`;
    groups.forEach(group => {
        html += `<p class='group-name'>- ${group}</p>`;
    });
    userGroups.innerHTML = html;
}

function showEditor(editable,inputtype='textarea',options=[]) {
    if (!q_allow_edit) {
        alert('You are not allowed to edit.');
        return;
    }

    if (editorDiv == null) {
        editorDiv = document.getElementById('editor-div');
    }
    if (editorText == null) {
        editorText = document.getElementById('editor-textarea');
    }
    if (editorSelect == null) {
        editorSelect = document.getElementById('editor-select');
    }

    if (editorDiv.classList.contains('editor-visible'))
        return;

    editorDiv.classList.remove('editor-hidden');
    editorDiv.classList.add('editor-visible');

    const rect = editable.getBoundingClientRect();
    editorDiv.style.width = rect.width + 'px';
    editorDiv.style.height = rect.height + 'px';

    // Store the value of the editable into an attribute
    key = editable.id.split('-')[1];
    editorText.value = desanitizeHtml(editable.innerHTML);
    editorText.setAttribute('original-id',editable.id);
    editorText.setAttribute('original-key',key);
    editorText.setAttribute('original-value',editable.innerHTML);
    editorText.setAttribute('is-cue-text',editable.classList.contains('cue-text'));
    editable.innerHTML = '';

    // Remove the editorDiv from its current parent, then append to a new parent
    editorDiv.remove();
    editable.appendChild(editorDiv);

    // Hide/show the appropriate type of input element
    if (inputtype == 'textarea') {
        editorText.style.display = 'inline';
        editorSelect.style.display = 'none';
    } else if (inputtype == 'select') {
        editorText.style.display = 'none';
        editorSelect.style.display = 'inline';

        editorSelect.innerHTML = '';
        options.forEach(option => {
            const newOpt = document.createElement('option');
            newOpt.value = option;
            newOpt.text = option;
            editorSelect.appendChild(newOpt);
        });

        let initialVal = editorText.getAttribute('original-value');
        if (initialVal && options.includes(initialVal)) {
            editorSelect.value = initialVal;
        }
    }
}

function saveEdits() {
    // Check if there is something to save
    if (editorText.getAttribute('original-value') == editorText.value) {
        console.log('Nothing to save.');
        cancelEdits();
        return;
    }

    if (editorText.getAttribute('is-cue-text') == 'true') {
        updateTranscript();
    } else {
        updateFile();
    }
}

function updateFile() {
    // Store data to database
    let key = editorText.getAttribute('original-key');
    let value = editorText.value;
    let pair = {};
    pair[key] = value;

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/update-file/${selectedFile}/`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify(pair)
    })
    .then(response => response.json())
    .then(data => {
        editorDiv.classList.remove('editor-visible');
        editorDiv.classList.add('editor-hidden');
        const editable = document.getElementById(editorText.getAttribute('original-id'));
        editable.innerHTML = sanitizeHtml(value);
    })
    .catch(error => {
        alert('Unable to save data. Error:', error);
    });
}

function cancelEdits() {
    const editable = document.getElementById(editorText.getAttribute('original-id'));

    editorDiv.classList.remove('editor-visible');
    editorDiv.classList.add('editor-hidden');

    editable.innerHTML = editorText.getAttribute('original-value');
}

function getMedia(file_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-media/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            displayError(data.error);
        } else {
            if (data.results.length > 0) {
                selectedFile = data.results[0].file_id;
                selectedFolder = data.results[0].folder_id;
                selectedFileName = data.results[0].file_name;
                showDetails(data.results[0]);
                showMedia(data.results[0]);
                showTranscript(file_id);
                getFilePosition(file_id,selectedFolder);
                getFileCount(selectedFolder);
            } else {
                alert('Record not found.');
            }
        }
    })
    .catch(error => {
        console.log(error);
    });
}


function cleanVTTContent(vttText) {
    return vttText
        // Remove WEBVTT header
        .replace('WEBVTT\n', '')
        // Split by timestamp patterns
        .split(/\d{2}:\d{2}:\d{2}\.\d{3}\s-->\s\d{2}:\d{2}:\d{2}\.\d{3}/)
        // Remove empty lines and trim each section
        .map(section => section.split('\n').filter(line => line.trim()).join(' ').trim())
        // Remove empty sections
        .filter(section => section)
        // Join with newlines
        .join('\n');
}

function updateTranscript() {
    const editable = document.getElementById(editorText.getAttribute('original-id'));
    let timeref = editable.dataset.cuestart + ' --> ' + editable.dataset.cueend;
    let oldstr = editorText.getAttribute('original-value');
    let newstr = editorText.value;

    let triple = {};
    triple['timeref'] = timeref;
    triple['oldstr'] = oldstr;
    triple['newstr'] = newstr;

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/update-transcript-segment/${q_file_id}/`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify(triple)
    })
    .then(response => response.json())
    .then(data => {
        if (data['rowcount'] > 0) {
            editorDiv.classList.remove('editor-visible');
            editorDiv.classList.add('editor-hidden');
            const editable = document.getElementById(editorText.getAttribute('original-id'));
            editable.innerHTML = sanitizeHtml(newstr);
        } else {
            alert('No matching text to replace!');
        }
    })
    .catch(error => {
        alert('Unable to save data. Error:', error);
    });
}

function getFirstMedia(folder_id = null,fn = null) {
    if (folder_id == null) folder_id = selectedFolder;
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/0/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'video,audio',
            'Skip-Status': '--NONE--',
            'Folder-ID': folder_id,
            'Direction': 'forward',
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            displayError(data.error);
        } else {
            if (data.results.length > 0) {
                if (selectedFile != data.results[0].file_id) {
                    selectedFile = data.results[0].file_id;
                    selectedFolder = data.results[0].folder_id;
                    showDetails(data.results[0]);
                    showMedia(data.results[0]);
                    showTranscript(selectedFile);
                    getAudit(selectedFile);
                    document.getElementById('detail-file-position').innerHTML = '(1 of ';
                    if (fn) fn(data.results[0]);
                } else {
                    alert('You are already at the top of the list.');
                }
            } else {
                alert('No more records.');
            }
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function getAdjacentMedia(direction='forward', skipList='--NONE--') {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/${selectedFile}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'video,audio',
            'Skip-Status': skipList,
            'Folder-ID': selectedFolder,
            'Direction': direction,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            displayError(data.error);
        } else {
            if (data.results.length > 0) {
                selectedFile = data.results[0].file_id;
                selectedFolder = data.results[0].folder_id;
                showDetails(data.results[0]);
                showMedia(data.results[0]);
                showTranscript(selectedFile);
                getAudit(selectedFile);
                getFilePosition(selectedFile,selectedFolder);
            } else {
                alert('No more records.');
            }
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function getLastMedia() {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/${INT_MAX}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'video,audio',
            'Skip-Status': '--NONE--',
            'Folder-ID': selectedFolder,
            'Direction': 'backward',
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            displayError(data.error);
        } else {
            if (data.results.length > 0) {
                if (selectedFile != data.results[0].file_id) {
                    selectedFile = data.results[0].file_id;
                    selectedFolder = data.results[0].folder_id;
                    showDetails(data.results[0]);
                    showMedia(data.results[0]);
                    showTranscript(selectedFile);
                    getAudit(selectedFile);
                    document.getElementById('detail-file-position').innerHTML = '(' + totalFiles + ' of ';
                } else {
                    alert('You are already at the bottom of the list.');
                }
            } else {
                alert('No more records.');
            }
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function getFileCount(folder_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-file-count/${folder_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        totalFiles = data.result;
        document.getElementById('detail-file-count').innerHTML = data.result + ' files)';
    })
    .catch(error => {
        console.log(error);
    });
}

function getFilePosition(file_id,folder_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-file-position/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Folder-ID': folder_id,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('detail-file-position').innerHTML = '(' + data.result + ' of ';
    })
    .catch(error => {
        console.log(error);
    });
}

function showMedia(data) {
    if (q_file_name == 'video') {
        const videoPlayer = document.getElementById('video-player');
        videoPlayer.src = data.file_url;
        videoPlayer.load();
    } else if (q_file_name == 'audio') {
        const audioPlayer = document.getElementById('audio-player');
        audioPlayer.src = data.file_url;
        audioPlayer.style.width = '100%';
        audioPlayer.load();
    }
}

function showDetails(data) {
    const attibutes = JSON.parse(data.attributes);
    videoLength = parseFloat(attibutes["length"])   
    const formattedTime = formatTime(videoLength)
    attibutes.length = formattedTime
    document.getElementById('detail-title').innerHTML = data.title == null ? "&nbsp;" : data.title;
    document.getElementById('detail-creator').innerHTML = data.creator == null ? "&nbsp;" : data.creator;
    document.getElementById('detail-subject').innerHTML = data.subject == null ? "&nbsp;" : data.subject;
    document.getElementById('detail-publisher').innerHTML = data.publisher == null ? "&nbsp;" : data.publisher;
    document.getElementById('detail-contributor').innerHTML = data.contributor == null ? "&nbsp;" : data.contributor;
    document.getElementById('detail-language').innerHTML = data.language == null ? "&nbsp;" : data.language;
    document.getElementById('detail-coverage').innerHTML = data.coverage == null ? "&nbsp;" : data.coverage;
    document.getElementById('detail-relation').innerHTML = data.relation == null ? "&nbsp;" : data.relation;
    document.getElementById('detail-rights').innerHTML = data.rights == null ? "&nbsp;" : data.rights;
    document.getElementById('detail-identifier').innerHTML = data.identifier == null ? "&nbsp;" : data.identifier;
    document.getElementById('detail-file-name').innerHTML = data.file_name == null ? "&nbsp;" : data.file_name;
    document.getElementById('detail-folder-name').innerHTML = data.folder_name == null ? "&nbsp;" : data.folder_name;
    document.getElementById('detail-file-type').innerHTML = data.file_type == null ? "&nbsp;" : data.file_type;
    document.getElementById('detail-media-type').innerHTML = data.media_source == null ? "&nbsp;" : data.media_source;
    document.getElementById('detail-file-size').innerHTML = data.size == null ? "&nbsp;" : data.size;
    document.getElementById('detail-created').innerHTML = data.date_created == null ? "&nbsp;" : data.date_created;
    document.getElementById('detail-uploaded').innerHTML = data.date_uploaded == null ? "&nbsp;" : data.date_uploaded;
    document.getElementById('detail-description').innerHTML = data.description == null ? "&nbsp;" : data.description;
    document.getElementById('detail-tags').innerHTML = data.tags == null ? "&nbsp;" : data.tags;
    document.getElementById('detail-people').innerHTML = data.people == null ? "&nbsp;" : data.people;
    document.getElementById('detail-places').innerHTML = data.places == null ? "&nbsp;" : data.places;
    document.getElementById('detail-texts').innerHTML = data.texts == null ? "&nbsp;" : data.texts;
    document.getElementById('detail-accessed').innerHTML = data.last_accessed == null ? "&nbsp;" : data.last_accessed;
    document.getElementById('detail-owner_name').innerHTML = data.owner_name == null ? "&nbsp;" : data.owner_name;
    document.getElementById('detail-group_name').innerHTML = data.group_name == null ? "&nbsp;" : data.group_name;
    document.getElementById('detail-remarks').innerHTML = data.remarks == null ? "&nbsp;" : data.remarks;
    document.getElementById('detail-version').innerHTML = data.version == null ? "&nbsp;" : data.version;
    document.getElementById('detail-attributes').innerHTML = JSON.stringify(attibutes);
    document.getElementById('detail-extra_data').innerHTML = data.extra_data == null ? "&nbsp;" : data.extra_data;
    document.getElementById('detail-status').innerHTML = data.file_status == null ? "&nbsp;" : data.file_status;
}

function showTranscript(file_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-transcript/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        let webvtt = data.transcript[0].webvtt;
/*
        // Need to use the more granularly timed web vtt!!!
        const vttBlob = new Blob([webvtt], { type: 'text/vtt' });
        const vttUrl = URL.createObjectURL(vttBlob);
        const trackElement = document.createElement('track');
        trackElement.src = vttUrl;
        trackElement.kind = 'subtitles';
        trackElement.srclang = 'en';
        trackElement.label = 'English';
        trackElement.default = true;
        const videoPlayer = document.getElementById('video-player');
        videoPlayer.appendChild(trackElement);
*/
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const headerDiv = document.getElementById('header');
        const transcript = document.getElementById('transcript');
        transcript.innerHTML = vttToHTML(webvtt);
        transcript.style.height = (viewportHeight-3*headerDiv.style.height) + 'px';

        const editables = document.getElementsByClassName('cue-text');
        Array.from(editables).forEach(editable => {
            editable.addEventListener('dblclick', () => showEditor(editable))
        });
    })
    .catch(error => {
        const transcript = document.getElementById('transcript');
        transcript.innerHTML = error.message;
    });
}

function syncTranscript(currentTime) {
    const formattedTime = timeToStr(currentTime);
    const paddedId = formattedTime.replace(/[:\.]/g, '').substr(0, 9);

    let vttTable = null
    try {
        vttTable = document.getElementById('vtt-table');
    } catch(error) {/* do nothing */};
    if (vttTable == null) return;

    // Find the row that matches or is the last one before the current time
    let currentRow = null;
    const rows = vttTable.querySelectorAll('tbody tr[id]');
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].id <= paddedId && paddedId <= rows[i].dataset.cueend) {
            currentRow = rows[i];
            break;
        }
    }

    // Remove highlight from previously highlighted row
    const prevRow = vttTable.querySelector('tr.highlighted');
    if (prevRow != null) {
        if (currentRow) {
            if (prevRow.id != currentRow.id) {
                prevRow.classList.remove('highlighted');
            }
        } else {
            if (paddedId < prevRow.id || prevRow.dataset.cueend < paddedId) {
                prevRow.classList.remove('highlighted');
            }
        }
    }

    // Highlight the found row
    if (currentRow) {
        currentRow.classList.add('highlighted');
        currentRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function hideDetails() {
    const videoDetails = document.getElementById('video-details');
    videoDetails.classList.remove('details-visible');
    videoDetails.classList.add('details-hidden');
}

function toggleAudit() {
    const settingsMenu = document.getElementById('settings-menu');
    settingsMenu.classList.remove('popup-visible');
    settingsMenu.classList.add('popup-hidden');

    const auditLog = document.getElementById('audit-log');
    const menuItem = document.getElementById('menu-audit');
    if (auditLog.classList.contains('audit-hidden')) {
        auditLog.classList.remove('audit-hidden');
        auditLog.classList.add('audit-visible');
        menuItem.innerHTML = 'Hide audit'
        getAudit(selectedFile);
    } else {
        auditLog.classList.remove('audit-visible');
        auditLog.classList.add('audit-hidden');
        menuItem.innerHTML = 'Show audit'
    }
}

function getAudit(file_id) {
    const auditLog = document.getElementById('audit-log');
    if (auditLog.classList.contains('audit-hidden')) return;

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-audit/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Max-Rows': maxRows,
            'Source-Table': 'mbox_file',
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            console.log(data.error);
        } else {
            displayAudit(data.results);
        }
    })
    .catch(error => {
        console.log(error)
        alert('Unable to save data. Error:', error);
    });
}

function displayAudit(results) {
    const auditLog = document.getElementById('audit-log');
    if (results.length === 0) {
        auditLog.innerHTML = 'No audit records yet.';
        return;
    }

    auditLog.style.maxHeight = window.innerHeight + 'px';

    let html = '<table><tr><td><p style="font-weight:bold; color:black;">AUDIT LOG</p><br></td></tr>';
    results.forEach(item => {
        html += `<tr><td>
        <p class='audit-detail'>${item.audit_id} (${item.record_id})</p>
        <p class='audit-detail'><span class='audit-key'>Username:</span>&nbsp;${item.username}</p>
        <p class='audit-detail'><span class='audit-key'>Action:</span>&nbsp;${item.activity}</p>
        <p class='audit-detail'><span class='audit-key'>Timestamp:</span>&nbsp;${item.event_timestamp}</p>
        <p class='audit-detail'><span class='audit-key'>IP Location:</span>&nbsp;${item.location}</p>
        <p class='audit-detail'><span class='audit-key'>Old Data:</span>&nbsp;<pre class="json-highlight" style="display: inline; white-space: pre-wrap; word-wrap: break-word;">${highlightJsonChanges(item.new_data, item.old_data)}</pre></p>
        <p class='audit-detail'><span class='audit-key'>New Data:</span>&nbsp;<pre class="json-highlight" style="display: inline; white-space: pre-wrap; word-wrap: break-word;">${highlightJsonChanges(item.old_data, item.new_data)}</pre></p>
        <hr></td></tr>`;
    });

    auditLog.innerHTML = html;
}
function highlightJsonChanges(oldData, newData) {
    const oldObj = typeof oldData === 'string' ? JSON.parse(oldData) : oldData;
    const newObj = typeof newData === 'string' ? JSON.parse(newData) : newData;
    
    function highlightStringDiff(oldStr, newStr) {
        oldStr = String(oldStr || '');
        newStr = String(newStr || '');
        
        let result = '';
        let highlightStarted = false;
        
        for (let i = 0; i < newStr.length; i++) {
            if (newStr[i] !== oldStr[i]) {
                if (!highlightStarted) {
                    result += '<span style="background-color: #fff3cd">';
                    highlightStarted = true;
                }
            } else {
                if (highlightStarted) {
                    result += '</span>';
                    highlightStarted = false;
                }
            }
            result += newStr[i];
        }
        
        if (highlightStarted) {
            result += '</span>';
        }
        
        return result;
    }

    const result = {};
    Object.keys(newObj).forEach(key => {
        if (oldObj[key] !== newObj[key]) {
            result[key] = highlightStringDiff(oldObj[key], newObj[key]);
        } else {
            result[key] = newObj[key];
        }
    });
    
    return JSON.stringify(result, null, 2)
        .replace(/"<span[^>]*>(.*?)<\/span>"/g, '<span style="background-color: #fff3cd">$1</span>')
        .replace(/\\n/g, '\n')
        .replace(/\\/g, '');
}


function browseFolder(parent_id = 1) {

    function fetchFolders(parent_id = 1) {
        const csrftoken = getCookie('csrftoken');
        return fetch(`/api/get-folders/${parent_id}/`, {
            method: 'GET',
            headers: {
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
                'Parent-ID': parent_id,
                'Max-Rows': maxRows,
                'X-CSRFToken': csrftoken,
            }
        })
        .then(response => response.json())
    }

    function createFolderElement(tree,folder) {
        const row = document.createElement('tr');
        const col = document.createElement('td');
        const icon = document.createElement('span');
        const label = document.createElement('span');
        row.appendChild(col);
        col.appendChild(icon);
        col.appendChild(label);
        icon.innerHTML = FOLDER_ICON;
        icon.style.paddingLeft = (folder.folder_level * FOLDER_WIDTH) + 'px';
        icon.setAttribute('folder_id',folder.folder_id);
        icon.classList.add('folder-icon');
        label.innerHTML = folder.name;
        label.setAttribute('folder_id',folder.folder_id);
        label.classList.add('folder-label');

        // Handle folder double-click to load subfolders
        icon.addEventListener('dblclick', function(event) {
            let lastRow = row;
            fetchFolders(folder.folder_id).then(subfolders => {
                if (subfolders.results.length) {
                    subfolders.results.forEach(subfolder => {
                        const newRow = createFolderElement(tree,subfolder);
                        tree.insertBefore(newRow,lastRow.nextSibling);
                        lastRow = newRow;
                    });
                }
            });
        });

        // Handle folder click to select the folder
        label.addEventListener('click', function(event) {
            folder['path_name'] = folder.path + folder.name;
            selectFolder(folder);
        });

        return row;
    }

    function createRootFolder() {
        const table = document.createElement('table');
        const row = document.createElement('tr');
        const col = document.createElement('td');
        const icon = document.createElement('span');
        const label = document.createElement('span');
        row.appendChild(col);
        col.appendChild(icon);
        col.appendChild(label);
        table.appendChild(row);
        table.id = 'folder-tree';
        icon.style.paddingLeft = '0px';
        icon.innerHTML = FOLDER_ICON;
        icon.setAttribute('folder_id',1);
        icon.classList.add('folder-icon');
        label.innerHTML = '[all folders]';
        label.setAttribute('folder_id',1);
        label.classList.add('folder-label');

        // Handle folder click to select the folder
        label.addEventListener('click', function(event) {
            let folder = { folder_id: 1, path: '', name: '[all folders]', path_name: '/', folder_level: 0 };
            selectFolder(folder);
        });

        return table;
    }

    fetchFolders(parent_id).then(folders => {
        const folderBrowser = document.getElementById('folder-browser');
        folderBrowser.innerHTML = '';
        const rootFolder = createRootFolder();
        folderBrowser.appendChild(rootFolder);

        folders.results.forEach(folder => {
            rootFolder.appendChild(createFolderElement(rootFolder,folder));
        });

        folderBrowser.classList.remove('folder-browser-hidden');
        folderBrowser.classList.add('folder-browser-visible');

        const breadCrumbs = document.getElementById('detail-folder-name');
        const rect = breadCrumbs.getBoundingClientRect();
        folderBrowser.style.top = (rect.y + rect.height) + 'px';
        folderBrowser.style.left = rect.x + 'px';           
    })
    .catch(error => {
        console.log(error);
        alert('An error occurred while fetching folders.');
    });
}

function selectFolder(folder) {
    const folderBrowser = document.getElementById('folder-browser');
    if (folderBrowser.classList.contains('folder-browser-visible')) {
        folderBrowser.classList.remove('folder-browser-visible');
        folderBrowser.classList.add('folder-browser-hidden');
    }
    getFirstMedia(folder.folder_id, (data) => {
        const breadCrumbs = document.getElementById('detail-folder-name');
        breadCrumbs.innerHTML = folder.path + folder.name;
        selectedFolder = folder.folder_id;
        getFileCount(folder.folder_id);
    });
}


function convertTableToText() {
    const table = document.getElementById('vtt-table');
    console.log('Table element:', table); // Check if table is found

    let textContent = '';

    // Get all rows except header
    const rows = table.querySelectorAll('tr');
    console.log('Number of rows found:', rows.length); // Check number of rows
    
    const dataRows = Array.from(rows).slice(1); // Skip header row
    console.log('Number of data rows:', dataRows.length); // Check number of data rows
    
    dataRows.forEach((row, index) => {
        console.log(`Processing row ${index + 1}`); // Track row processing
        
        const cells = row.querySelectorAll('td');
        console.log(`Number of cells in row ${index + 1}:`, cells.length, cells);
        
        // Get the cell containing p tags (third column)
        const cell = cells[0];
        console.log(`Cell content for row ${index + 1}:`, cell?.innerHTML);
        
        if (cell) {
            // Get all p tags within the cell
            const paragraphs = cell.querySelectorAll('p');
            console.log(`Number of paragraphs in row ${index + 1}:`, paragraphs.length);
            
            // Extract text from each p tag
            paragraphs.forEach((p, pIndex) => {
                const text = p.textContent.trim();
                console.log(`Paragraph ${pIndex + 1} text:`, text);
                
                if (text && text !== 'undefined') {
                    textContent += `${text}\n`;
                }
            });
        }
    });

    console.log('Final text content:', textContent); // Check final output
    return textContent;
}

function formatTime(seconds) {
    const sign = seconds < 0 ? '-' : '';
    seconds = Math.abs(seconds);
    
    return sign + new Date(seconds * 1000).toISOString().slice(11, 23);
}

// Add click event to download button
document.getElementById('download-transcript').addEventListener('click', function() {
    console.log('Download button clicked'); // Verify click handler is working
    const textContent = convertTableToText();
    const cleanedText = cleanVTTContent(textContent);
    if (!cleanedText) {
        console.log('No text content generated');
        alert('No content found to download');
        return;
    }
    
    // Create and trigger download
    const blob = new Blob([cleanedText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const lastDot = selectedFileName.lastIndexOf('.');
    a.href = url;
    a.download = selectedFileName.substring(0,lastDot) + '_transcript.txt';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
});

