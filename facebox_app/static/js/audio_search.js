const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';
const FOLDER_ICON = '\u{1F4C1}';
const FOLDER_WIDTH = 20;

let currentPage = 1;
let totalPages = 1;
let recordSet = null;
let currentFolder = '/';
let maxRows = 10;

document.addEventListener('DOMContentLoaded', function() {
    const searchBox = document.getElementById('search-box');
    const searchButton = document.getElementById('search-button');
    const resetButton = document.getElementById('reset-button');
    const topPageButton = document.getElementById('top-page');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const bottomTopPageButton = document.getElementById('bottom-top-page');
    const bottomPrevPageButton = document.getElementById('bottom-prev-page');
    const bottomNextPageButton = document.getElementById('bottom-next-page');
    const audiosTab = document.getElementById('audios-tab');
    const folderBrowser = document.getElementById('folder-browser');

    searchButton.addEventListener('click', performSearch);
    resetButton.addEventListener('click', resetPage);
    topPageButton.addEventListener('click', () => goToPage('top'));
    prevPageButton.addEventListener('click', () => goToPage('prev'));
    nextPageButton.addEventListener('click', () => goToPage('next'));
    bottomTopPageButton.addEventListener('click', () => goToPage('top'));
    bottomPrevPageButton.addEventListener('click', () => goToPage('prev'));
    bottomNextPageButton.addEventListener('click', () => goToPage('next'));

    searchBox.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            performSearch();
        }
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

    audiosTab.style.color = '#ffffff';

    const editorStatus = document.getElementById('editor-status');
    editorStatus.innerHTML = q_allow_edit ? 'Editing allowed' : 'Read-only';

    setMaxRows(maxRows);

    // Initial load
    performSearch();
});

function performSearch() {
    /* Valid cases:
       Empty search string = get all records
       Improperly quoted - error
console.log('hello',isValidTsQueryString('hello')); // true
console.log('"hello"',isValidTsQueryString('"hello"')); // true
console.log('hello world',isValidTsQueryString('hello world')); // true
console.log('"hello world"',isValidTsQueryString('"hello world"')); // true
console.log('hello & world',isValidTsQueryString('hello & world')); // true
console.log('hello | world',isValidTsQueryString('hello | world')); // true
console.log('!hello',isValidTsQueryString('!hello')); // true
console.log('(hello)',isValidTsQueryString('(hello)')); // true
console.log('"hello" world',isValidTsQueryString('"hello" world')); // false
console.log('hello "world"',isValidTsQueryString('hello "world"')); // false
    */
    const searchBox = document.getElementById('search-box');
    let value = searchBox.value.trim();
    currentPage = 1;
    if (value.length == 0 || isValidTsQueryString(value)) {
        searchAudios(value,currentFolder); 
    } else if (isUnquoted(value) && containsSpace(value)) {
        // make the search string a valid TsQuery. Assume OR.
        value = trimWhitespaces(value).replaceAll(' ',' | ');
        searchAudios(value,currentFolder);
    } else {
        alert("Invalid search string.");
    }
}

function updatePlaceholder() {
    const searchBox = document.getElementById('search-box');
    if (currentFolder == '/') {
        searchBox.placeholder = "[Search audios in all folders]";
    } else {
        searchBox.placeholder = `[Search audios in ${currentFolder}]`;
    }
}

function resetPage() {
    const searchBox = document.getElementById('search-box');
    searchBox.value = "";
    updatePlaceholder();
    currentPage = 1;
    searchAudios("",currentFolder);
}

function searchAudios(pattern = '', scope = '/') {
    const csrftoken = getCookie('csrftoken');
    const offset = (currentPage - 1) * maxRows;
    fetch('/api/search-audio/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Max-Rows': maxRows,
            'Start-From': offset,
            'Pattern': pattern,
            'Scope': scope,
            'Media-Type': 'audio',
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            displayError(data.error);
        } else {
            recordSet = data.results;
            displayResults(data.results);
            highlightWords(dequote(pattern));
            updatePagination(data.results);
        }
    })
    .catch(error => {
        console.log(error);
        displayError('An error occurred while fetching data.');
    });
}

function displayResults(results) {
    const resultsBody = document.getElementById('results-body');
    resultsBody.innerHTML = '';

    if (results == null) {
        resultsBody.innerHTML = '<tr><td colspan="20">API call returned null.</td></tr>';
        return;
    }

    if (results.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="20">No matching records found.</td></tr>';
        return;
    }

    results.forEach(item => {
        const row = document.createElement('tr');
        row.id = "row_" + item.file_id;
        row.addEventListener('dblclick', function(event) {
            window.open('/app/media-player/?file_id='+item.file_id+'&file_name=audio', '_blank');
        });

        // Initialize some nullable data
        attributes = '';
        if (item.attributes != null) {
            attributes = JSON.stringify(item.attributes).replaceAll("\\","").replaceAll('"','');
        }
        extra_data = '';
        if (item.extra_data != null) {
            extra_data = JSON.stringify(item.extra_data).replaceAll("\\","").replaceAll('"','');
        }
        people = '';
        if (item.people != null) {
            people = item.people.replaceAll(",",", ").replaceAll("{","").replaceAll("}",""); 
        }
        places = '';
        if (item.places != null) {
            places = item.places.replaceAll(",",", ").replaceAll("{","").replaceAll("}","");
        }
        tags = '';
        if (item.tags != null) {
            tags = customTrim(item.tags,"[]");
        }
        texts = '';
        if (item.texts != null) {
            texts = customTrim(item.texts,"[]");
        }

        let html = `
            <td>${item.file_id}</td>
            <td><a href="${item.file_url}" class="hyperlink" target="_blank">${item.file_name}</a><br><br>
                <a href="#" onclick="goToVoices(${item.file_id},'${item.file_name}')">Voices</a></td>
            <td>${item.extension.toUpperCase().replaceAll('.','')}</td>
            <td>${item.media_source}</td>
            <td>${formatSize(item.size)}</td>
            <td>${formatDate(item.date_created)}</td>
            <td>${formatDate(item.date_uploaded)}</td>`;
        if (item.description == null) html += `<td class='field-description'>&nbsp;</td>`;
        else html += `<td class='field-description'>${item.description}</td>`;
        html += `
            <td>${tags}</td>
            <td>${people}</td>
            <td>${places}</td>
            <td>${formatDate(item.last_accessed)}</td>`;
        if (item.owner_name == null) html += '<td>None</td>';
        else html += `<td>${item.owner_name}</td>`;
        if (item.group_name == null) html += '<td>None</td>';
        else html += `<td>${item.group_name}</td>`;
        if (item.remarks== null) html += '<td>None</td>';
        else html += `<td>${item.remarks}</td>`;
        html += `
            <td>${item.version}</td>
            <td>${attributes}</td>`;
        if (item.extra_data == null) html += '<td>None</td>';
        else html += `<td>${extra_data}</td>`;
        html += `<td>${item.file_status}</td>`;

        row.innerHTML = html;
        resultsBody.appendChild(row);
    });
}

function highlightWords(searchString) {
    if (searchString.length == 0) {
        //console.log('Nothing to highlight.');
        return;
    }
    const table = document.getElementById('results-table');
    const searchWords = searchString.toLowerCase().split(/\s+/);

    function highlightNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let content = node.textContent;
            let lowerContent = content.toLowerCase();
            let changed = false;
            
            for (let word of searchWords) {
                if (lowerContent.includes(word)) {
                    let regex = new RegExp(`(${word})`, 'gi');
                    content = content.replace(regex, (match) => {
                        changed = true;
                        return `<span style="background-color: #808000;">${match}</span>`;
                    });
                }
            }
            
            if (changed) {
                let span = document.createElement('span');
                span.innerHTML = content;
                node.parentNode.replaceChild(span, node);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            for (let child of node.childNodes) {
                highlightNode(child);
            }
        }
    }
    
    const tdElements = table.getElementsByTagName('td');
    for (let td of tdElements) {
        highlightNode(td);
    }
}

function updatePagination(results) {
    if (results == null) return;

    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const bottomPrevPageButton = document.getElementById('bottom-prev-page');
    const bottomNextPageButton = document.getElementById('bottom-next-page');

    prevPageButton.disabled = (currentPage === 1);
    bottomPrevPageButton.disabled = (currentPage === 1);

    nextPageButton.disabled = (results.length < maxRows);
    bottomNextPageButton.disabled = (results.length < maxRows);
}

function goToPage(direction) {
    switch (direction) {
        case 'top':
            currentPage = 1;
            break;
        case 'prev':
            if (currentPage > 1) {
                currentPage--;
            }
            break;
        case 'next':
            currentPage++;
            break;
    }
    searchAudios(document.getElementById('search-box').value,currentFolder);
}

function displayError(message) {
    const resultsBody = document.getElementById('results-body');
    resultsBody.innerHTML = `<tr><td colspan="20">${message}</td></tr>`;
}

function browseFolder(parent_id = 1) {

    function fetchFolders(parent_id = 1) {
        const csrftoken = getCookie('csrftoken');
        return fetch(`/api/get-folder/${parent_id}/`, {
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

        const breadCrumbs = document.getElementById('bread-crumbs');
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
    const breadCrumbs = document.getElementById('bread-crumbs');
    breadCrumbs.innerHTML = folder.path + folder.name;
    currentFolder = folder.path_name;
    updatePlaceholder();
    performSearch();
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
