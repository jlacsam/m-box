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
let maxRows = 100;

document.addEventListener('DOMContentLoaded', function() {

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

    const reportsTab = document.getElementById('reports-tab');
    reportsTab.style.color = '#ffffff';

    setMaxRows(maxRows);

    showAudit(0);
    //showFolders();
});

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

function showAudit(file_id) {

    const auditRecords = document.getElementById('audit-records');
    auditRecords.style.color = '#ffffff';
    const folderCounts = document.getElementById('folder-counts');
    folderCounts.style.color = '#888888';

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
    const auditLog = document.getElementById('results-div');
    if (results.length === 0) {
        auditLog.innerHTML = 'No audit records yet.';
        return;
    }

    auditLog.style.maxHeight = window.innerHeight + 'px';

    let html = `<table class='results-table'><tr><th>Audit ID</th><th>Username</th><th>Action</th><th>Timestamp</th>
        <th>Location</th><th>Table</th><th>Record ID</th><th>Old Data</th><th>New Data</th><th>Remarks</th></tr>`;
    results.forEach(item => {
        html += `<tr>
            <td>${item.audit_id}</td>
            <td>${item.username}</td>
            <td>${item.activity}</td>
            <td>${formatGMTToLocal(item.event_timestamp)}</td>
            <td>${item.location == null ? '-' : item.location}</td>
            <td>${item.table_name == null ? '-' : item.table_name.substring(4)}</td>
            <td>${item.record_id == null ? '-' : item.record_id}</td>
            <td>${formatJsonString(item.old_data,2)}</td>
            <td>${formatJsonString(item.new_data,2)}</td>
            <td>${item.remarks == null ? '-' : item.remarks}</td>
            </tr>`;
    });
    html += '</table>';
    auditLog.innerHTML = html;
}

function showFolders(parent_id = 1) {

    const folderCounts = document.getElementById('folder-counts');
    folderCounts.style.color = '#ffffff';
    const auditRecords = document.getElementById('audit-records');
    auditRecords.style.color = '#888888';

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
        const col1 = document.createElement('td');
        const col2 = document.createElement('td');
        const icon = document.createElement('span');
        const label = document.createElement('span');
        row.id = 'row_' + folder.folder_id;
        row.appendChild(col1);
        row.appendChild(col2);
        col1.innerHTML = folder.folder_id;
        col2.appendChild(icon);
        col2.appendChild(label);
        icon.innerHTML = FOLDER_ICON;
        icon.style.paddingLeft = (folder.folder_level * FOLDER_WIDTH) + 'px';
        icon.setAttribute('folder_id',folder.folder_id);
        icon.classList.add('folder-icon');
        label.innerHTML = folder.name;
        label.setAttribute('folder_id',folder.folder_id);
        label.classList.add('folder-label');
        appendColumns(row,folder);

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

    function createHeaders(table) {
        const row = document.createElement('tr');
        table.appendChild(row);
        const headers = ['ID','Folder Name','Stats As Of','Updated','Subfolders','Files','Videos',
            'Audios','Photos','For Review','Reviewed',''];
        headers.forEach(header => {
            const hd = document.createElement('th');
            hd.innerHTML = header;
            row.appendChild(hd);
        });
    }

    function appendColumns(row,folder) {
        const values = [formatGMTToLocal(folder.stats_as_of),timeElapsed(folder.stats_as_of),
            folder.subfolder_count,folder.file_count,folder.video_count,folder.audio_count,
            folder.photo_count,folder.file_count-folder.reviewed_count,folder.reviewed_count];
        values.forEach(value => {
            let col = document.createElement('td');
            col.innerHTML = value;
            col.style.textAlign = 'right';
            row.appendChild(col);
        });
        let col = document.createElement('td');
        col.style.textAlign = 'center';
        row.appendChild(col);
        let button = document.createElement('button');
        button.innerHTML = '\u27F3';
        button.addEventListener('click', function() {
            if (confirm('This operation can potentially slowdown the server when the number of files in the folder is tens of thousands or more. Continue?')) {
                refreshFolderStats(folder.folder_id);
            }
        });
        col.appendChild(button);
    }

    function createRootFolder(folder) {
        const table = document.createElement('table');
        createHeaders(table);
        const row = document.createElement('tr');
        const col1 = document.createElement('td');
        const col2 = document.createElement('td');
        const icon = document.createElement('span');
        const label = document.createElement('span');
        row.id = 'row_' + folder.folder_id;
        row.appendChild(col1);
        row.appendChild(col2);
        col1.innerHTML = folder.folder_id;
        col2.appendChild(icon);
        col2.appendChild(label);
        table.appendChild(row);
        table.id = 'folder-tree';
        table.classList.add('results-table');
        icon.style.paddingLeft = '0px';
        icon.innerHTML = FOLDER_ICON;
        icon.setAttribute('folder_id',1);
        icon.classList.add('folder-icon');
        label.innerHTML = '[all folders]';
        label.setAttribute('folder_id',1);
        label.classList.add('folder-label');
        appendColumns(row,folder);

        // Handle folder click to select the folder
        label.addEventListener('click', function(event) {
            let folder = { folder_id: 1, path: '', name: '[all folders]', path_name: '/', folder_level: 0 };
            selectFolder(folder);
        });

        return table;
    }

    fetchFolders(0).then(folders => {
        const folderBrowser = document.getElementById('results-div');
        folderBrowser.innerHTML = '';
        const rootFolder = createRootFolder(folders.results[0]);
        folderBrowser.appendChild(rootFolder);

        fetchFolders(parent_id).then(folders => {
            folders.results.forEach(folder => {
                rootFolder.appendChild(createFolderElement(rootFolder,folder));
            });
        })
        .catch(error => {
            console.log(error);
            alert('An error occurred while fetching folders.');
        });
    })
    .catch(error => {
        console.log(error);
        alert('An error occurred while fetching the root folder.');
    });
}

function selectFolder(folder) {
    console.log('No action associated to selecting a folder.');
}

function setMaxRows(value) {
    maxRows = value;
    const maxRowsUL = document.getElementById('max-rows-options');
    const maxRowsLIs = maxRowsUL.querySelectorAll('li');
    maxRowsLIs.forEach(li => {
        if (li.id == ("li-"+maxRows.toString())) {
            li.style.listStyleType = 'disc';
        } else {
            li.style.listStyleType = 'none';
        }
    });
}

function refreshFolderStats(folder_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/refresh-folder-stats/${folder_id}/`, {
        method: 'PATCH',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Folder-ID': folder_id,
            'Max-Rows': maxRows,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.rowcount > 0) {
            fetch(`/api/get-folder/${folder_id}/`, {
                method: 'GET',
                headers: {
                    'Subscription-ID': SUBSCRIPTION_ID,
                    'Client-Secret': CLIENT_SECRET,
                    'Folder-ID': folder_id,
                    'Max-Rows': maxRows,
                    'X-CSRFToken': csrftoken,
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.log(data.error);
                } else {
                    replaceRow(data.results[0]);
                }
            })
            .catch(error => {
                alert('Unable to retrieve updated data:', error);
            });
        } else {
            alert('No such folder to refresh.');
        }
    })
    .catch(error => {
        alert('Unable to refresh folder stats:', error);
    });
}

function replaceRow(folder) {
    const curRow = document.getElementById('row_' + folder.folder_id); 
    const cols = curRow.querySelectorAll('td');
    cols[0].innerHTML = folder.folder_id;
    cols[2].innerHTML = formatGMTToLocal(folder.stats_as_of);
    cols[3].innerHTML = timeElapsed(folder.stats_as_of);
    cols[4].innerHTML = folder.subfolder_count;
    cols[5].innerHTML = folder.file_count;
    cols[6].innerHTML = folder.video_count;
    cols[7].innerHTML = folder.audio_count;
    cols[8].innerHTML = folder.photo_count;
    cols[9].innerHTML = folder.reviewed_count;
    cols[10].innerHTML = folder.file_count - folder.reviewed_count;
}
