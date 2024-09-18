const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';

let editorDiv = null;
let editorText = null;
let maxRows = 10;

document.addEventListener('DOMContentLoaded', function() {
    const photosTab = document.getElementById('photos-tab');

    window.addEventListener('resize', function() {
        const headerDiv = document.getElementById('header');
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
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

    photosTab.style.color = '#ffffff';

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
    updateFile();
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
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function showMedia(data) {
    const photoViewer = document.getElementById('photo-viewer');
    photoViewer.src = data.file_url;
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
