const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';
const FILE_STATUSES = ['For review','Reviewed'];
const APPROVED_STATUS = 'Reviewed';
const INT_MAX = 2147483647;
const FOLDER_ICON = '\u{1F4C1}';
const FOLDER_WIDTH = 20;

let selectedFile = 0
let selectedFolder = 0
let editorDiv = null;
let editorText = null;
let editorSelect = null;
let totalFiles = 0;
let maxRows = 10;

document.addEventListener('DOMContentLoaded', function() {
    const photosTab = document.getElementById('photos-tab');
    const folderBrowser = document.getElementById('folder-browser');

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

    folderBrowser.addEventListener('mouseleave', function(Event) {
        if (folderBrowser.classList.contains('folder-browser-visible')) {
            folderBrowser.classList.remove('folder-browser-visible');
            folderBrowser.classList.add('folder-browser-hidden');
        }
    });

    photosTab.style.color = '#ffffff';

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
    updateFile();
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
    if (editorDiv == null) return;
    if (editorDiv.classList.contains('editor-visible')) {
        editorDiv.classList.remove('editor-visible');
    }

    if (!editorDiv.classList.contains('editor-hidden')) {
        editorDiv.classList.add('editor-hidden');
    }

    if (editorText == null) return;
    const element_id = editorText.getAttribute('original-id');
    if (element_id == null) return;

    const editable = document.getElementById(element_id);
    editable.innerHTML = editorText.getAttribute('original-value');
}

function getMedia(file_id) {
    showBusy();
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
                showDetails(data.results[0]);
                showMedia(data.results[0]);
                getFilePosition(file_id,selectedFolder);
                getFileCount(selectedFolder);
            } else {
                alert('Record not found.');
            }
        }
        hideBusy();
    })
    .catch(error => {
        console.log(error);
        hideBusy();
    });
}

function getFirstPhoto(folder_id = null,fn = null) {
    showBusy();
    cancelEdits();
    if (folder_id == null) folder_id = selectedFolder;
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/0/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'photo',
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
        hideBusy();
    })
    .catch(error => {
        console.log(error);
        hideBusy();
    });
}

function getAdjacentPhoto(direction='forward', skipList='--NONE--') {
    showBusy();
    cancelEdits();
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/${selectedFile}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'photo',
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
                getAudit(selectedFile);
                getFilePosition(selectedFile,selectedFolder);
            } else {
                alert('No more records.');
            }
        }
        hideBusy();
    })
    .catch(error => {
        console.log(error);
        hideBusy();
    });
}

function getLastPhoto() {
    showBusy();
    cancelEdits();
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/${INT_MAX}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'photo',
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
                    getAudit(selectedFile);
                    document.getElementById('detail-file-position').innerHTML = '(' + totalFiles + ' of ';
                } else {
                    alert('You are already at the bottom of the list.');
                }
            } else {
                alert('No more records.');
            }
        }
        hideBusy();
    })
    .catch(error => {
        console.log(error);
        hideBusy();
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
    console.log(data)
    const photoViewer = document.getElementById('photo-viewer');
    photoViewer.src = '';
    photoViewer.src = data.file_url;
}

function showDetails(data) {
    document.getElementById('detail-folder-name').innerHTML = data.folder_name;
    document.getElementById('detail-file-name').innerHTML = data.file_name;
    document.getElementById('detail-file-id').innerHTML = '(ID:' + data.file_id + ')';
    document.getElementById('detail-file-type').innerHTML = data.file_type;
    document.getElementById('detail-media-type').innerHTML = data.media_source;
    document.getElementById('detail-creator').innerHTML = data.creator;
    document.getElementById('detail-subject').innerHTML = data.subject;
    document.getElementById('detail-publisher').innerHTML = data.publisher;
    document.getElementById('detail-contributor').innerHTML = data.contributor;
    document.getElementById('detail-language').innerHTML = data.language;
    document.getElementById('detail-coverage').innerHTML = data.coverage;
    document.getElementById('detail-relation').innerHTML = data.relation;
    document.getElementById('detail-rights').innerHTML = data.rights;
    document.getElementById('detail-identifier').innerHTML = data.identifier;
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
    document.getElementById('detail-status').innerHTML = data.file_status;

    document.getElementById('detail-archive-url').setAttribute('file-name', data.file_name);
    document.getElementById('detail-archive-url').setAttribute('archive-url', data.archive_url);
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
    cancelEdits();
    const folderBrowser = document.getElementById('folder-browser');
    if (folderBrowser.classList.contains('folder-browser-visible')) {
        folderBrowser.classList.remove('folder-browser-visible');
        folderBrowser.classList.add('folder-browser-hidden');
    }
    getFirstPhoto(folder.folder_id, (data) => {
        const breadCrumbs = document.getElementById('detail-folder-name');
        breadCrumbs.innerHTML = folder.path + folder.name;
        selectedFolder = folder.folder_id;
        getFileCount(folder.folder_id);
    });
}

function showBusy() {
    const photoView = document.getElementById('photo-view');
    const mediaContainer = document.getElementById('media-container');
    const photoViewer = document.getElementById('photo-viewer');
    const detailsView = document.getElementById('details-view');
    const detailsTable = document.getElementById('details-table');

    photoView.style.cursor = 'wait';;
    mediaContainer.style.cursor = 'wait';
    photoViewer.style.cursor = 'wait';
    detailsView.style.cursor = 'wait';
    detailsTable.style.cursor = 'wait';
}

function hideBusy() {
    const photoView = document.getElementById('photo-view');
    const mediaContainer = document.getElementById('media-container');
    const photoViewer = document.getElementById('photo-viewer');
    const detailsView = document.getElementById('details-view');
    const detailsTable = document.getElementById('details-table');

    photoView.style.cursor = 'default';;
    mediaContainer.style.cursor = 'default';
    photoViewer.style.cursor = 'default';
    detailsView.style.cursor = 'default';
    detailsTable.style.cursor = 'default';
}

function downloadArchiveCopy() {
    const span = document.getElementById('detail-archive-url');
    const archive_url = span.getAttribute('archive-url');
    const file_name = span.getAttribute('file-name');
    if (archive_url == null) {
        alert("The archive copy url is not available.");
        return;
    }

    const anchor = document.createElement('a');
    anchor.href = archive_url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.click();
}

function checkNextPhoto() {
    if (!q_allow_edit) {
        alert('You are not allowed to edit.');
        return;
    }

    if (document.getElementById('detail-status').innerHTML == APPROVED_STATUS) {
        console.log('Already reviewed. Nothing to save.');
        getAdjacentPhoto('forward');
        return;
    }

    cancelEdits();

    let pair = { 'status' : APPROVED_STATUS };

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/update-file/${selectedFile}/`, {
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
        document.getElementById('detail-status').innerHTML = APPROVED_STATUS;
        getAdjacentPhoto('forward');
    })
    .catch(error => {
        alert('Unable to save data. Error:', error);
    });
}
