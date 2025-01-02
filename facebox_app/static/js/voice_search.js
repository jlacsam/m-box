const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';
const MAX_ROWS = 25;
const MSG_DEFAULT1 = 'Drag and drop a 5 to 10-second MP3 voice recording here.';
const MSG_DEFAULT2 = 'Or, click search to see all unique voices in the selected video or audio.';
const PLAY_BUTTON = '\u23F5';
const STOP_BUTTON = '\u23F9';
const PENCIL_BUTTON = '\u270E';

const COLORS = [
        'firebrick','dodgerblue','forestgreen','darkorange','deepskyblue','chartreuse',
        'antiquewhite','blueviolet','aquamarine','chocolate','aqua','cyan',
        'coral','blue','darkcyan','crimson','darkturquoise','darkseagreen',
        'deeppink','darkorchid','darkgrey','ivory','indigo','lawngreen',
        'lemonchiffon','lighblue','green','orange','mediumslateblue','limegreen',
        'maroon','navy','olive','orangered','paleturquoise','palegreen',
        'pink','royalblue','olivedrab','red','powderblue','seagreen',
        'sienna','slateblue','slategray','thistle','skyblue','teal',
        'tomato','steelblue','wheat','yellow','silver','yellowgreen'
    ];

let lastVoice = null;
let lastPerson = null;
let totalResults = 0;
let selectedFile = "0";
let selectedFileName = "";
let editorDiv = null;
let editorFN = null;
let editorMN = null;
let editorLN = null;
let maxRows = MAX_ROWS;
let captions = null;

document.addEventListener('DOMContentLoaded', function() {
    const preview = document.getElementById('preview');
    const fileName = document.getElementById('fileName');
    const similaritySlider = document.getElementById('similarity-slider');
    const similarityValue = document.getElementById('similarity-value');
    const msgDiv = document.getElementById('dnd_msg');
    const resultsDiv = document.getElementById('results');
    const searchBox = document.getElementById('search-box');
    const closeSearchFilter = document.getElementById('close-search-filter');
    const voicesTab = document.getElementById('voices-tab');
    const profileIcon = document.getElementById('profile');

    const videoPlayer = document.getElementById('video-player');
    videoPlayer.addEventListener('timeupdate', () => {
        hideEditButton();
        syncDiary(videoPlayer.currentTime);
        syncCaption(videoPlayer.currentTime);
    });

    videoPlayer.addEventListener('pause', () => {
        showEditButton();
    });

    videoPlayer.addEventListener('ended', () => {
        showEditButton();
    });

    const audioPlayer = document.getElementById('audio-player');
    audioPlayer.addEventListener('timeupdate', () => {
        hideEditButton();
        syncDiary(audioPlayer.currentTime);
        syncCaption(audioPlayer.currentTime);
    });

    audioPlayer.addEventListener('pause', () => {
        showEditButton();
    });

    audioPlayer.addEventListener('ended', () => {
        showEditButton();
    });

    const floatingAudio = document.getElementById('floating-audio');
    floatingAudio.setAttribute('stopTime','0');
    floatingAudio.addEventListener('timeupdate', () => {
        let stopTime = parseFloat(floatingAudio.getAttribute('stopTime'));
        if (stopTime > 0) {
            if (floatingAudio.currentTime >= stopTime) {
                stopStreamingAudio();
            }
        }
    });

    similaritySlider.addEventListener('input', (e) => {
        similarityValue.textContent = e.target.value;
    });

    searchBox.addEventListener('click', async () => {
        performSearch();
    });

    searchBox.addEventListener('keyup', (e) => {
        if (e.key)
            if (e.key == 'Control' || e.key == 'Shift' || e.key == 'Alt' || e.key.startsWith('Arrow'))
                return;
        performSearch();
    });

    closeSearchFilter.addEventListener('click', async () => {
        searchBox.value = "";
        searchBox.placeholder = "[Search all videos and photos]";
        hideSearchFilter();
    });

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

    const segmentMenu = document.getElementById('segment-menu');
    segmentMenu.addEventListener('mouseleave', function(event) {
        if (segmentMenu.classList.contains('popup-visible')) {
            segmentMenu.classList.remove('popup-visible');
            segmentMenu.classList.add('popup-hidden');
        }
    });

    // Set global variables
    editorDiv = document.getElementById('editor-div');
    editorFN = document.getElementById('first_name');
    editorMN = document.getElementById('middle_name');
    editorLN = document.getElementById('last_name');

    voicesTab.style.color = '#ffffff';

    setMaxRows(maxRows);
    getGroups();

    // A query parameter was passed to the page, display all faces associated with the file_id
    if (parseInt(q_file_id) > 0) {
        selectedFile = q_file_id;
        selectedFileName = q_file_name;
        searchBox.placeholder = '[Search ' + q_file_name + ']';
        searchPersons();
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

function performSearch() {
    const searchBox = document.getElementById('search-box');
    let value = searchBox.value.trim();
    if (value.length == 0 || value == "*" || value == "?") return;
    if (isValidTsQueryString(value)) {
        showSearchFilter(value);
    } else if (isUnquoted(value) && containsSpace(value)) {
        // make the search string a valid TsQuery. Assume OR.
        value = trimWhitespaces(value).replaceAll(' ',' | ');
        showSearchFilter(value);
    }
}

function resetPage() {
    const resultsDiv = document.getElementById('results');
    const moreDiv = document.getElementById('more');
    const searchBox = document.getElementById('search-box');
    const resultsLabel = document.getElementById('results-label');

    lastVoice = null;
    lastPerson = null;
    totalResults = 0;
    selectedFile = "0";
    selectedFileName = "";
    resultsDiv.innerHTML = "";
    moreDiv.innerHTML = "";
    searchBox.value = "";
    searchBox.placeholder = "[Search all videos and photos]";
    resultsLabel.innerHTML = "";
}

function searchVoices(voice_id) {
    const segmentMenu = document.getElementById('segment-menu');
    if (segmentMenu.classList.contains('popup-visible')) {
        segmentMenu.classList.remove('popup-visible');
        segmentMenu.classList.add('popup-hidden');
    }

    const csrftoken = getCookie('csrftoken');
    const similaritySlider = document.getElementById('similarity-slider');

    fetch(`/api/search-voice-by-ref/${voice_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Similarity': similaritySlider.value,
            'Media-List': '0',
            'Max-Rows': maxRows,
            'X-CSRFToken': csrftoken,
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            results.innerHTML = `<p>Error: ${data.error}</p>`;
        } else {
            displayResults(data);
            displayFooter(voice_id,data);
            updateResultsLabel();
            trackLastVoice(data);
        }
    })
    .catch(error => {
        results.innerHTML = `<p>ERROR: ${error.message}</p>`;
    });
}

function searchMoreVoices(voice_id) {
    const csrftoken = getCookie('csrftoken');
    const resultsDiv = document.getElementById('results');
    const moreDiv = document.getElementById('more');
    const similaritySlider = document.getElementById('similarity-slider');
    const scrollPosition = window.scrollY || window.pageYOffset;

    if (lastVoice != null) {
        fetch(`/api/search-voice-by-ref/${voice_id}/`, {
            method: 'GET',
            headers: {
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
                'Similarity': similaritySlider.value,
                'Media-List': '0',
                'Max-Rows': maxRows,
                'Start-From': JSON.stringify(lastVoice),
                'X-CSRFToken': csrftoken,
            },
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                results.innerHTML += `<p>Error: ${data.error}</p>`;
            } else {
                displayResults(data,true);
                displayFooter(voice_id,data,true);
                updateResultsLabel();
                trackLastVoice(data);
                window.scrollTo(0, scrollPosition);
            }
        })
        .catch(error => {
            resultsDiv.innerHTML += `<p>ERROR: ${error.message}</p>`;
        });
    } else {
        console.log("ERR: It shouldn't be possible to call this function if lastVoice is null!");
    }
}

function searchPersons() {
    const csrftoken = getCookie('csrftoken');
    fetch('/api/search-person/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Video-List': selectedFile,
            'Max-Rows': maxRows,
            'X-CSRFToken': csrftoken,
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            results.innerHTML = `<p>Error: ${data.error}</p>`;
        } else {
            displayPersonTiles(data);
            displayFooter(data,false,'searchMorePersons()');
            displayThumbnails(data);
            updateResultsLabel();
            trackLastPerson(data);
        }
    })
    .catch(error => {
        results.innerHTML = `<p>ERROR: ${error.message}</p>`;
    });
}

function searchMorePersons() {
    const csrftoken = getCookie('csrftoken');
    const resultsDiv = document.getElementById('results');
    const moreDiv = document.getElementById('more');
    const scrollPosition = window.scrollY || window.pageYOffset;

    if (lastPerson == null) {
        console.log("ERR: It shouldn't be possible to call this function if lastPerson is null!");
        return;
    }

    fetch('/api/search-person/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Video-List': selectedFile,
            'Max-Rows': maxRows,
            'Start-From': JSON.stringify(lastPerson),
            'X-CSRFToken': csrftoken,
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            results.innerHTML = `<p>Error: ${data.error}</p>`;
        } else {
            displayPersonTiles(data,true);
            displayFooter(data,true,'searchMorePersons()');
            displayThumbnails(data);
            updateResultsLabel();
            trackLastPerson(data);
            window.scrollTo(0, scrollPosition);
        }
    })
    .catch(error => {
        results.innerHTML = `<p>ERROR: ${error.message}</p>`;
    });
}

function displayResults(data, append = false) {
    const resultsContainer = document.getElementById('results');
    let table;

    if (append) {
        table = resultsContainer.querySelector('#results-table');
        if (!table) {
            table = document.createElement('table');
            table.id = 'results-table';
            resultsContainer.appendChild(table);
        }
    } else {
        resultsContainer.innerHTML = '';
        table = document.createElement('table');
        table.id = 'results-table';
        resultsContainer.appendChild(table);

        const headerRow = document.createElement('tr');
        ['Voice ID', 'File Name', 'Length', 'Speaker', 'Full Name', 'Start Time', 'End Time', 'Similarity'].forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);
    }

    const items = data.results;
    items.forEach(item => {
        const row = document.createElement('tr');
        
        const createCell = (content) => {
            const cell = document.createElement('td');
            cell.innerHTML = content;
            return cell;
        };

        row.appendChild(createCell(item.voice_id));
        row.appendChild(createCell(`${item.file_name}&nbsp;<span id="play-stop-${item.voice_id}" onclick="streamAudio(this,${item.file_id},${item.time_start},${item.time_end})" class="play-stop">&#9205;</span>`));
        row.appendChild(createCell(`${(item.time_end - item.time_start).toFixed(2)}s`));
        row.appendChild(createCell(item.speaker));
        row.appendChild(createCell(item.full_name != null ? item.full_name : 'Unknown'));
        row.appendChild(createCell(formatTime(item.time_start)));
        row.appendChild(createCell(formatTime(item.time_end)));
        row.appendChild(createCell(`${(100.0 * item.similarity).toFixed(2)}%`));

        table.appendChild(row);
    });

    if (append) {
        totalResults += items.length;
    } else {
        totalResults = items.length;
    }
}

function displayFaceTiles(data,append=false) {
    let html = '';
    const items = data.results;
    items.forEach(item => {
        similarity = (100.0 * item.similarity).toFixed(2);
        box = JSON.stringify(item.box).replaceAll("\\","").replaceAll('"','')
        tile = `<div class="tile"><table class="tile_table"><tr><td>
            <table>
                <tr><td><img id="thumbnail_${item.face_id}" class="thumbnail" src="" alt="thumbnail"></td></tr>
                <tr><td><div class="field_label">Similarity</div>
                    <div class="field_value">${similarity}%</div></td></tr>
            </table>
            </td><td>
            <table>
                <tr><td><div class="field_label">Filename</div>
                    <div class="field_value"><a href="${item.file_url}" class="hyperlink" target="_blank">${item.file_name}</a></div></td></tr>
                <tr><td><div class="field_label">Time range</div>
                    <div class="field_value">${formatTime(item.time_start)} - ${formatTime(item.time_end)}</div></td></tr>
                <tr><td><div class="field_label">Bounding box</div>
                    <div class="field_value">${box}</div></td></tr>
                <tr><td><div class="field_label">Name</div>
                    <div class="field_value">${item.full_name}</div></td></tr>
            </table>
        </td><tr></table></div>`;
        html += tile;
    });
    if (append) {
        totalResults += items.length;
        results.innerHTML += html;
    } else {
        totalResults = items.length;
        results.innerHTML = html;
    }
}

function displayPersonTiles(data,append=false) {
    let html = '';
    const items = data.results;
    items.forEach(item => {
        confidence = item.confidence.toFixed(2);
        box = JSON.stringify(item.box).replaceAll("\\","").replaceAll('"','')
        tile = `<div class="tile"><table class="tile_table"><tr><td>
            <table>
                <tr><td><img id="thumbnail_${item.face_id}" class="thumbnail" src="" alt="thumbnail"></td></tr>
                <tr><td><div class="field_label">Confidence</div>
                    <div class="field_value">${confidence}%</div></td></tr>
            </table>
            </td><td>
            <table class="table_fields">
                <tr><td><div class="field_label">Name</div>
                    <div id="fullname_${item.face_id}" class="field_editable"
                        data-person_id="${item.person_id}" 
                        data-first_name="${item.first_name || ''}" 
                        data-middle_name="${item.middle_name || ''}"
                        data-last_name="${item.last_name || ''}">${item.full_name}</div></td></tr>
                <tr><td><div class="field_label">Filename</div>
                    <div class="field_value"><a href="${item.file_url}" class="hyperlink" target="_blank">${item.file_name}</a></div></td></tr>
                <tr><td><div class="field_label">Time range</div>
                    <div class="field_value">${formatTime(item.time_start)} - ${formatTime(item.time_end)}</div></td></tr>
                <tr><td><div class="field_label">Bounding box</div>
                    <div class="field_value">${box}</div></td></tr>
            </table>
        </td><tr></table></div>`;
        html += tile;
    });

    if (append) {
        totalResults += items.length;
        results.innerHTML += html;
    } else {
        totalResults = items.length;
        results.innerHTML = html;
    }
}

function displayThumbnails(data) {
    const csrftoken = getCookie('csrftoken');
    const items = data.results;
    items.forEach(item => {
        fetch(`/api/get-image/${item.face_id}/`, {
            method: 'GET',
            headers: {
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
                'X-CSRFToken': csrftoken,
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.blob(); // Get the image data as a blob
        })
        .then(blob => {
            // Create a URL for the blob and display it as an image
            const imageUrl = URL.createObjectURL(blob);
            const imageObj = document.getElementById('thumbnail_' + item.face_id);
            imageObj.src = imageUrl;
        })
        .catch(error => {
            console.error('There was a problem with the fetch operation:', error);
            document.getElementById('imageDisplay').innerHTML = '<p>Error loading image</p>';
        });
    });
}

function displayFooter(voice_id, data, append=false, clickfn='searchMoreVoices') {
    const moreDiv = document.getElementById('more');
    const items = data.results;
    if (items.length == maxRows) {
        let html = '<a href="#" onclick="' + clickfn + '(' + voice_id + ')">more</a>';
        moreDiv.innerHTML = html;
    } else {
        if (append) {
            moreDiv.innerHTML = items.length + " more records found.";
        } else {
            moreDiv.innerHTML = items.length + " records found.";
        }
    }
}

function updateResultsLabel() {
    const resultsLabel = document.getElementById('results-label');
    resultsLabel.innerHTML = "Showing " + totalResults + " matching voices in the database."; 
}

function trackLastVoice(data) {
    const items = data.results;
    if (items.length > 0) {
        let lastRecord = items[items.length-1]
        lastVoice = { voice_id: lastRecord.voice_id, similarity: lastRecord.similarity };
    } else {
        lastVoice = null;
    }
}

function trackLastPerson(data) {
    const items = data.results;
    if (items.length > 0) {
        let lastRecord = items[items.length-1]
        lastPerson = { person_id: lastRecord.person_id };
    } else {
        lastPerson = null;
    }
}

function showSearchFilter(value="") {
    const csrftoken = getCookie('csrftoken');
    const searchBox = document.getElementById('search-box');
    const searchFilter = document.getElementById('search-filter');
    const videoList = document.getElementById('video-list');

    const rect1 = searchBox.getBoundingClientRect();
    const rect2 = searchFilter.getBoundingClientRect();
    let x = rect1.x - (rect2.width - rect1.width) / 2;
    let y = rect1.y + rect1.height + 2;

    searchFilter.style.left = x + 'px';
    searchFilter.style.top = y + 'px';
    searchFilter.classList.remove('filter-hidden');
    searchFilter.classList.add('filter-visible');

    fetch('/api/search-video/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Max-Rows': maxRows,
            'Start-From': 0,
            'Pattern': value,
            'Scope': '/',
            'Media-Type': 'audio,video',
            'X-CSRFToken': csrftoken,
        },
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            results.innerHTML += `<p>Error: ${data.error}</p>`;
        } else {
            if (data.results.length > 0) {
                listVideos(data);
            } else {
                videoList.innerHTML = 'No matching records found.';
            }
        }
    })
    .catch(error => {
        results.innerHTML += `<p>ERROR: ${error.message}</p>`;
    });
}

function hideSearchFilter() {
    const searchFilter = document.getElementById('search-filter');

    searchFilter.style.top = '0px';
    searchFilter.classList.remove('filter-visible');
    searchFilter.classList.add('filter-hidden');
}

function listVideos(data) {
    const items = data.results;
    const videoList = document.getElementById('video-list');
    let html = '<table>';
    items.forEach(item => {
        html += `<tr><td class="video-item" 
            onclick="selectFile(${item.file_id},'${item.file_name}','${item.file_url}')">
            <div class="video-name">${item.file_name}</div>
            <div class="video-desc">${truncateAtWord(item.description)}</div></td></tr>`;
    });
    html += '</table>';
    videoList.innerHTML = html;
}

function selectFile(file_id,file_name,file_url) {
    if (totalResults > 0) {
        if (confirm("Do you want to clear the current results?")) {
            resetPage();
        } else {
            return;
        }
    }

    const searchBox = document.getElementById('search-box');

    hideSearchFilter();
    searchBox.value = "";
    searchBox.placeholder = "[Search " + file_name + "]";
    selectedFile = file_id;
    selectedFileName = file_name;

    const mediaContainer = document.getElementById('media-container');
    const videoPlayer = document.getElementById('video-player');
    const audioPlayer = document.getElementById('audio-player');

    // Reset the audio and video players
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayer.currentTime = 0;
    audioPlayer.pause();
    audioPlayer.src = '';
    audioPlayer.currentTime = 0;

    if (file_name.includes('.mp4')) {
        mediaContainer.style.backgroundColor = 'black';
        audioPlayer.style.display = 'none';
        videoPlayer.style.display = 'block';
        videoPlayer.src = file_url;
        videoPlayer.load();
    } else if (file_name.includes('.mp3')) {
        mediaContainer.style.backgroundColor = '#21272a';
        videoPlayer.style.display = 'none';
        audioPlayer.style.display = 'block';
        audioPlayer.src = file_url;
        audioPlayer.load();
    }

    showDiary(file_id);
    getTranscript(file_id);
}

function showEditor() {
    if (editorDiv.classList.contains('editor-visible')) {
        return;
    }

    if (selectedFileName.includes('.mp4')) {
        const videoPlayer = document.getElementById('video-player');
        videoPlayer.pause();
    } else if (selectedFileName.includes('.mp3')) {
        const audioPlayer = document.getElementById('audio-player');
        audioPlayer.pause();
    }

    const editable = document.getElementById('speaker-name');

    editorFN.value = editable.getAttribute('first_name');
    editorMN.value = editable.getAttribute('middle_name');
    editorLN.value = editable.getAttribute('last_name');

    editorDiv.classList.remove('editor-hidden');
    editorDiv.classList.add('editor-visible');

    // Hide the editor button as well
    hideEditButton();

    // Store the value of the editable into an attribute
    editorDiv.setAttribute('original-id',editable.id);
    editorDiv.setAttribute('original-value',editable.innerHTML);
    editorDiv.setAttribute('original-person-id',editable.getAttribute('person_id'));
    editorDiv.setAttribute('original-speaker',editable.getAttribute('speaker'));
    editable.innerHTML = '';

    // Remove the editorDiv from its current parent, then append to a new parent
    editorDiv.remove();
    editable.appendChild(editorDiv);
}

function saveEdits() {
    const first_name = editorFN.value;
    const middle_name = editorMN.value;
    const last_name = editorLN.value;
    const full_name = (first_name + ' ' + middle_name + ' ' + last_name).trim();

    // Check if there is something to save
    if (editorDiv.getAttribute('original-value') == full_name) {
        console.log('Nothing to save.');
        cancelEdits();
        return;
    }

    let person = {};
    person['first_name'] = first_name;
    person['middle_name'] = middle_name;
    person['last_name'] = last_name;

    const person_id = editorDiv.getAttribute('original-person-id');
    const speaker = editorDiv.getAttribute('original-speaker');

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/update-person/${person_id}/`, {
        method: 'PATCH',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(person)
    })
    .then(response => response.json())
    .then(data => {
        editorDiv.classList.remove('editor-visible');
        editorDiv.classList.add('editor-hidden');
        const editable = document.getElementById(editorDiv.getAttribute('original-id'));
        editable.innerHTML = sanitizeHtml(full_name);
        editable.dataset.first_name = first_name;
        editable.dataset.middle_name = middle_name;
        editable.dataset.last_name = last_name;
        updateDiary(speaker,full_name,first_name,middle_name,last_name);
    })
    .catch(error => {
        alert('Unable to save data.');
        console.log(error);
    });
}

function updateDiary(speaker,full_name,first_name,middle_name,last_name) {
    const diaryTable = document.getElementById('diary-table');
    const segments = diaryTable.querySelectorAll('td');
    segments.forEach((segment) => {
        if (segment.dataset.speaker == speaker) {
            segment.dataset.full_name = full_name;
            segment.dataset.first_name = first_name
            segment.dataset.middle_name = middle_name
            segment.dataset.last_name = last_name
        }
    });
}

function cancelEdits() {
    const editable = document.getElementById(editorDiv.getAttribute('original-id'));
    editorDiv.classList.remove('editor-visible');
    editorDiv.classList.add('editor-hidden');
    editable.innerHTML = editorDiv.getAttribute('original-value');

    // Show the editor button as well
    showEditButton();
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
        getAudit(0);
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
            'Source-Table': 'mbox_person',
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
        <p class='audit-detail'>${item.audit_id} (${item.record_id})</p>
        <p class='audit-detail'><span class='audit-key'>Username:</span>&nbsp;${item.username}</p>
        <p class='audit-detail'><span class='audit-key'>Action:</span>&nbsp;${item.activity}</p>
        <p class='audit-detail'><span class='audit-key'>Timestamp:</span>&nbsp;${item.event_timestamp}</p>
        <p class='audit-detail'><span class='audit-key'>IP Location:</span>&nbsp;${item.location}</p>
        <p class='audit-detail'><span class='audit-key'>Old Data:</span>&nbsp;<pre class="json-highlight" style="display: inline; white-space: pre-wrap; word-wrap: break-word;">${formatJsonString(item.old_data)}</pre></p>
        <p class='audit-detail'><span class='audit-key'>New Data:</span>&nbsp;<pre class="json-highlight" style="display: inline; white-space: pre-wrap; word-wrap: break-word;">${formatJsonString(item.new_data)}</pre></p>
        <hr></td></tr>`;
    });
    html += '</table>';

    auditLog.innerHTML = html;
}

function showDiary(file_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-diary/${file_id}/`, {
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
            console.log(data.error);
        } else {
            displayDiary(data.results);
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function displayDiary(results) {
    const diaryContainer = document.getElementById('diary-container');
    if (results.length == 0) {
        diaryContainer.innerHTML = 'No available data.';
        return;
    }

    duration = results[results.length-1].time_end - results[0].time_start;
    if (duration == 0) {
        diaryContainer.innerHTML = 'The media file has zero duration.';
        return;
    }

    let html = '<table id="diary-table" class="diary-table"><tr>';
    results.forEach(item => {
        let width = 100.0 * (item.time_end - item.time_start) / duration;
        let speaker = item.full_name == null ? item.speaker : item.full_name;
        let color_index = parseInt(item.speaker.split('_')[1]) % COLORS.length;
        let color = COLORS[color_index];
        let first_name = item.first_name == null ? '' : item.first_name;
        let middle_name = item.middle_name == null ? '' : item.middle_name;
        let last_name = item.last_name == null ? '' : item.last_name;
        html += `<td id='voice_${item.voice_id}' 
            style='width:${width}%; color:${color}; overflow:hidden;' 
            onclick='showSegmentMenu(this,${item.voice_id})' 
            title='${speaker}' 
            class='diary-td'
            data-file_id='${item.file_id}' 
            data-person_id='${item.person_id}' 
            data-speaker='${item.speaker}' 
            data-time_start='${item.time_start}' 
            data-time_end='${item.time_end}' 
            data-full_name='${item.full_name}'
            data-first_name='${first_name}'
            data-middle_name='${middle_name}'
            data-last_name='${last_name}'
            >${color_index}
        </td>`;
    });
    html += '</table>';

    diaryContainer.innerHTML = html;
}

function showSegmentMenu(td,voice_id) {
    const segmentMenu = document.getElementById('segment-menu');
    const speaker = td.dataset.full_name == null ? td.dataset.speaker : td.dataset.full_name;
    let html = `<table>
        <tr><td class='segment-label'>${speaker}</td></tr>
        <tr><td class='segment-timestamp'>${timeToStr(td.dataset.time_start)} - ${timeToStr(td.dataset.time_end)}</td></tr>
        <tr><td><hr></td></tr>
        <tr><td onclick='jumpToSegment(${td.dataset.time_start})' class='segment-action'>Jump to segment</td></tr>
        <tr><td onclick='searchVoices(${voice_id})' class='segment-action'>Search similar voices</td></tr>
    </table>`;

    const rect = td.getBoundingClientRect();
    segmentMenu.style.top = (rect.y + rect.height) + 'px';
    segmentMenu.style.left = rect.x + 'px';
    segmentMenu.innerHTML = html;
    if (segmentMenu.classList.contains('popup-hidden')) {
        segmentMenu.classList.remove('popup-hidden');
        segmentMenu.classList.add('popup-visible');
    }

    const rect2 = segmentMenu.getBoundingClientRect();
    if (rect2.x + rect2.width > window.innerWidth) {
        segmentMenu.style.left = (window.innerWidth - rect2.width) + 'px';
    }
}

function jumpToSegment(ref_time) {
    const videoPlayer = document.getElementById('video-player');
    const audioPlayer = document.getElementById('audio-player');

    if (videoPlayer.src != null && videoPlayer.src != '') {
        videoPlayer.currentTime = ref_time;
    } 

    if (audioPlayer.src != null && audioPlayer.src != '') {
        audioPlayer.currentTime = ref_time;
    }

    const segmentMenu = document.getElementById('segment-menu');
    if (segmentMenu.classList.contains('popup-visible')) {
        segmentMenu.classList.remove('popup-visible');
        segmentMenu.classList.add('popup-hidden');
    }
}

function syncDiary(current_time) {
    const diaryTable = document.getElementById('diary-table');
    if (diaryTable == null) {
        return;
    }

    const cols = document.querySelectorAll('td.diary-td');
    
    // Find the col that matches or is the last one before the current time
    let currentCol = null;
    for (let i = 0; i < cols.length; i++) {
        if (cols[i].dataset.time_start <= current_time && current_time <= cols[i].dataset.time_end) {
            currentCol = cols[i];
            break;
        }
    }

    // Remove highlight from previously highlighted row
    const prevCol = diaryTable.querySelector('td.highlighted');
    if (prevCol != null) {
        if (currentCol) {
            if (prevCol.id != currentCol.id) {
                prevCol.classList.remove('highlighted');
            }
        } else {
            if (current_time < prevCol.dataset.time_start || prevCol.dataset.time_end < current_time) {
                prevCol.classList.remove('highlighted');
            }
        }
    }

    // Update the current speaker name and highlight the found col
    const speakerName = document.getElementById('speaker-name');
    const speakerEdit = document.getElementById('speaker-edit');
    if (currentCol) {
        currentCol.classList.add('highlighted');
        let speaker = currentCol.dataset.full_name == null ? 
            currentCol.dataset.speaker : currentCol.dataset.full_name;
        speakerName.innerHTML = speaker;
        speakerName.setAttribute('person_id',currentCol.dataset.person_id);
        speakerName.setAttribute('speaker',currentCol.dataset.speaker);
        speakerName.setAttribute('first_name',currentCol.dataset.first_name); 
        speakerName.setAttribute('middle_name',currentCol.dataset.middle_name); 
        speakerName.setAttribute('last_name',currentCol.dataset.last_name); 
        speakerEdit.innerHTML = PENCIL_BUTTON;
    } else {
        speakerName.innerHTML = '&nbsp;';
        speakerName.setAttribute('person_id',0);
        speakerName.setAttribute('speaker','');
        speakerName.setAttribute('first_name','');
        speakerName.setAttribute('middle_name','');
        speakerName.setAttribute('last_name','');
        speakerEdit.innerHTML = '&nbsp;';
    }

    // Hide the editor if it is visible
    if (editorDiv.classList.contains('editor-visible')) {
        editorDiv.classList.remove('editor-visible');
        editorDiv.classList.add('editor-hidden');
    }
}

function hideEditButton() {
    const editorButton = document.getElementById('speaker-edit');
    editorButton.style.display = 'none';
}

function showEditButton() {
    const editorButton = document.getElementById('speaker-edit');
    editorButton.style.display = 'inline';
}

function getTranscript(file_id) {
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
        captions = vttToJSON(data.transcript[0].webvtt);
    })
    .catch(error => {
        captions = null;
        console.log('Unable to get transcript.');
    });
}

function syncCaption(current_time) {
    if (captions == null) {
        return;
    }

    // Find the caption that matches or is the last one before the current time
    let text = null;
    for (let i = 0; i < captions.length; i++) {
        const formattedTime = timeToStr(current_time);
        if (captions[i].StartTime <= formattedTime && formattedTime <= captions[i].EndTime) {
            text = captions[i].Text;
            break;
        }
    }

   if (text != null) {
       const captionContainer = document.getElementById('captions-container');
       captionContainer.innerHTML = text;
   }
}

function streamAudio(obj,file_id,time_start=0,time_end=0) {
    const audioPlayer = document.getElementById('floating-audio');

    if (obj.innerHTML == PLAY_BUTTON) {
        const csrftoken = getCookie('csrftoken');
        const fetchAudio = (offset=0) => {
            return fetch(`/api/stream-audio/${file_id}/`, {
                method: 'GET',
                headers: {
                    'Subscription-ID': SUBSCRIPTION_ID,
                    'Client-Secret': CLIENT_SECRET,
                    'Time-Offset': offset,
                    'X-CSRFToken': csrftoken,
                }
            });
        };

        fetchAudio(time_start)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            const audioUrl = URL.createObjectURL(blob);
            audioPlayer.src = audioUrl;
            audioPlayer.type = 'audio/mpeg';
            audioPlayer.currentTime = time_start;
            audioPlayer.setAttribute('stopTime',time_end);
            audioPlayer.setAttribute('obj_id',obj.id);
            audioPlayer.play();
            obj.innerHTML = STOP_BUTTON;
        })
        .catch(error => {
            console.log('Error loading audio:', error);
        });
    } else {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        audioPlayer.src = '';
        obj.innerHTML = PLAY_BUTTON;
    }
}

function stopStreamingAudio() {
    const floatingAudio = document.getElementById('floating-audio');
    floatingAudio.pause();
    floatingAudio.currentTime = 0;
    floatingAudio.src = '';

    const playStopButton = document.getElementById(floatingAudio.getAttribute('obj_id'));
    playStopButton.innerHTML = PLAY_BUTTON;
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
