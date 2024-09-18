const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';

let editorDiv = null;
let editorText = null;
let maxRows = 10;

document.addEventListener('DOMContentLoaded', function() {
    const videosTab = document.getElementById('videos-tab');
    const audiosTab = document.getElementById('audios-tab');
    const videoPlayer = document.getElementById('video-player');
    const audioPlayer = document.getElementById('audio-player');

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

    if (q_file_name == 'video') {
        videosTab.style.color = '#ffffff';
    }

    if (q_file_name == 'audio') {
        audiosTab.style.color = '#ffffff';
    }

    const editables = document.getElementsByClassName('detail_editable');
    Array.from(editables).forEach(editable => {
        editable.addEventListener('dblclick', () => showEditor(editable))
    });

    if (parseInt(q_file_id) > 0) {
        selectedFile = q_file_id;
        selectedFileName = q_file_name;
        getMedia(selectedFile);
    }
});

function showEditor(editable) {
    if (!q_allow_edit)
        return;

    if (editorDiv == null) {
        editorDiv = document.getElementById('editor-div');
    }
    if (editorText == null) {
        editorText = document.getElementById('editor');
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
    fetch(`/api/update-file/${q_file_id}/`, {
        method: 'PATCH',
        headers: {
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
            showDetails(data.results[0]);
            showMedia(data.results[0]);
            showTranscript(file_id);
        }
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
    document.getElementById('detail-file-name').innerHTML = data.file_name;
    document.getElementById('detail-file-type').innerHTML = data.file_type;
    document.getElementById('detail-media-type').innerHTML = data.media_source;
    document.getElementById('detail-file-size').innerHTML = data.size;
    document.getElementById('detail-created').innerHTML = data.date_created
    document.getElementById('detail-uploaded').innerHTML = data.date_uploaded;
    document.getElementById('detail-description').innerHTML = data.description;
    document.getElementById('detail-tags').innerHTML = data.tags;
    document.getElementById('detail-people').innerHTML = data.people;
    document.getElementById('detail-places').innerHTML = data.places;
    document.getElementById('detail-texts').innerHTML = data.texts;
    document.getElementById('detail-accessed').innerHTML = data.last_accessed;
    document.getElementById('detail-owner_name').innerHTML = data.owner_name;
    document.getElementById('detail-group_name').innerHTML = data.group_name;
    document.getElementById('detail-remarks').innerHTML = data.remarks;
    document.getElementById('detail-version').innerHTML = data.version;
    document.getElementById('detail-attributes').innerHTML = data.attributes;
    document.getElementById('detail-extra_data').innerHTML = data.extra_data;
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
        getAudit(q_file_id);
    } else {
        auditLog.classList.remove('audit-visible');
        auditLog.classList.add('audit-hidden');
        menuItem.innerHTML = 'Show audit'
    }
}

function getAudit(file_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-audit/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Max-Rows': maxRows,
            'Source-Table': 'mbx_file',
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
        console.log(error);
        alert('Unable to save data. Error:', error);
    });
}

function displayAudit(results) {
    const auditLog = document.getElementById('audit-log');
    if (results.length === 0) {
        auditLog.innerHTML = 'No audit records yet.';
        return;
    }

    let html = '<table><tr><td><p style="font-weight:bold; color:black;">AUDIT LOG</p><br></td></tr>';
    results.forEach(item => {
        html += `<tr><td>
            <p class='audit-detail'>${item.audit_id}</p>
            <p class='audit-detail'><span class='audit-key'>Username:</span>&nbsp;${item.username}</p>
            <p class='audit-detail'><span class='audit-key'>Action:</span>&nbsp;${item.activity}</p>
            <p class='audit-detail'><span class='audit-key'>Timestamp:</span>&nbsp;${item.event_timestamp}</p>
            <p class='audit-detail'><span class='audit-key'>IP Location:</span>&nbsp;${item.location}</p>
            <p class='audit-detail'><span class='audit-key'>Old Data:</span>&nbsp;${formatJsonString(item.old_data)}</p>
            <p class='audit-detail'><span class='audit-key'>New Data:<span>&nbsp;${formatJsonString(item.new_data)}</p>
            <hr></td></tr>`;
    });

    auditLog.innerHTML = html;
}
