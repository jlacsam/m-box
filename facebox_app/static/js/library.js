const SUBSCRIPTION_ID = "00000000";
const CLIENT_SECRET = "00000000";
const FOLDER_ICON = "\u{1F4C1}";
const FILE_ICON = "\u{1F5CE}";
const AUDIO_ICON = "\u{1F5AD}";
const DISABLED_ICON = "\u{1F6AB}";
const COLUMN_FILTER_ICON = "\u{25A5}";
const FOLDER_WIDTH = 20;
const DEFAULT_HIDDEN_COLUMNS = [6, 8, 9, 14, 16, 17, 18];
const ADD_ICON = "+";
const REMOVE_ICON = "\u{2212}";
const CLOSE_ICON = "\u{24E7}";
const FIRST_ICON = "\u{21E4}";
const PREV_ICON = "\u{21A4}";
const NEXT_ICON = "\u{21A6}";
const LAST_ICON = "\u{21E5}";
const INT_MAX = 2147483647;

let currentPage = 1;
let totalPages = 1;
let recordSet = null;
let currentFolder = "/";
let currentFolderID = 1;
let maxRows = 250;
let hiddenColumns = new Set(DEFAULT_HIDDEN_COLUMNS);
let editorDiv = null;
let editorText = null;
let editorSelect = null;

$.fn.dataTable.ext.errMode = 'none';

document.addEventListener("DOMContentLoaded", function () {

    const searchButton = document.getElementById("search-button");
    searchButton.addEventListener("click", performSearch);

    const resetButton = document.getElementById("reset-button");
    resetButton.addEventListener("click", resetPage);

    const renameButton = document.getElementById("btn-rename");
    renameButton.addEventListener("click", () => renameItem());

    const moveButton = document.getElementById("btn-move");
    moveButton.addEventListener("click", () => moveItem());

    const setOwnerButton = document.getElementById("btn-set-owner");
    setOwnerButton.addEventListener("click", () => setItemOwner());

    const setGroupButton = document.getElementById("btn-set-group");
    setGroupButton.addEventListener("click", () => setItemGroup());

    const setAccessButton = document.getElementById("btn-set-access");
    setAccessButton.addEventListener("click", () => setItemAccess());

    const searchBox = document.getElementById("search-box");
    searchBox.addEventListener("keyup", function (event) {
        if (event.key === "Enter") {
            performSearch();
        }
    });

    const profileIcon = document.getElementById("profile");
    const popupMenu = document.getElementById("popup-menu");
    profileIcon.addEventListener("click", function (event) {
        if (popupMenu.classList.contains("popup-hidden")) {
            popupMenu.style.top = "65px";
            popupMenu.style.width = "150px";
            popupMenu.style.left = window.innerWidth - 180 + "px";
            popupMenu.classList.remove("popup-hidden");
            popupMenu.classList.add("popup-visible");
        } else if (popupMenu.classList.contains("popup-visible")) {
            popupMenu.classList.remove("popup-visible");
            popupMenu.classList.add("popup-hidden");
        }
    });

    popupMenu.addEventListener("mouseleave", function (event) {
        if (popupMenu.classList.contains("popup-visible")) {
            popupMenu.classList.remove("popup-visible");
            popupMenu.classList.add("popup-hidden");
        }
    });

    const settingsIcon = document.getElementById("settings");
    const settingsMenu = document.getElementById("settings-menu");
    settingsIcon.addEventListener("click", function (event) {
        if (settingsMenu.classList.contains("popup-hidden")) {
            settingsMenu.style.top = "65px";
            settingsMenu.style.width = "150px";
            settingsMenu.style.left = window.innerWidth - 180 + "px";
            settingsMenu.classList.remove("popup-hidden");
            settingsMenu.classList.add("popup-visible");
        } else if (settingsMenu.classList.contains("popup-visible")) {
            settingsMenu.classList.remove("popup-visible");
            settingsMenu.classList.add("popup-hidden");
        }
    });

    settingsMenu.addEventListener("mouseleave", function (event) {
        if (settingsMenu.classList.contains("popup-visible")) {
            settingsMenu.classList.remove("popup-visible");
            settingsMenu.classList.add("popup-hidden");
        }
    });

    const folderBrowser = document.getElementById("folder-browser");
    folderBrowser.addEventListener("mouseleave", function (Event) {
        if (folderBrowser.classList.contains("folder-browser-visible")) {
            folderBrowser.classList.remove("folder-browser-visible");
            folderBrowser.classList.add("folder-browser-hidden");
        }
    });

    const libraryTab = document.getElementById("library-tab");
    libraryTab.style.color = "#ffffff";

    const selectAll = document.getElementById('select-all');
    selectAll.addEventListener("click", function(e) {
        const query = 'input[type="checkbox"][id^="cb_"]';
        Array.from(document.querySelectorAll(query)).forEach(checkbox => {
            checkbox.checked = selectAll.checked;
        });
        e.stopPropagation();
        toggleContextButtons();
    });

    const uploadButton = document.getElementById('upload-button');
    uploadButton.onclick = () => {
        window.location.href = "/app/uploader/?folder_id=" + currentFolderID;
    }

    const keyInput = document.getElementById('keyInput');
    keyInput.addEventListener('focus', function() { this.select(); });
    const valueInput = document.getElementById('valueInput');
    valueInput.addEventListener('focus', function() { this.select(); });

    const dialog = document.getElementById('key-value-dialog');
    dialog.addEventListener('close', () => {
        const form = document.getElementById('key-value-form');
        const key = form.elements.key.value;
        const value = form.elements.value.value;
        if (isAlphaNumeric(key)) {
            updateExtraData(key, value);
        }
    });

    document.getElementById('cancel-dialog').addEventListener('click', () => {
        dialog.close();
    });

    // Get initial folder
    savedFolder = getCookie('Library.currentFolder');
    savedFolderID = getCookie('Library.currentFolderID');
    if (savedFolder != null) currentFolder = savedFolder;
    if (savedFolderID != null) currentFolderID = savedFolderID;
    const breadCrumbs = document.getElementById("bread-crumbs");
    breadCrumbs.innerHTML = currentFolder == '/' ? '[all folders]' : currentFolder;
    updatePlaceholder();

    // Get initial hidden columns
    savedHiddenColumns = getCookie('Library.hiddenColumns');
    if (savedHiddenColumns) hiddenColumns = new Set(JSON.parse(savedHiddenColumns));

    // Get initial max rows
    savedMaxRows = getCookie('Library.maxRows');
    if (savedMaxRows) maxRows = parseInt(savedMaxRows);
    setMaxRows(maxRows);

    getGroups();

    // Initial load
    getFolders(1,'folder-list',false,false);
    browseFolder(currentFolderID);
    toggleContextButtons();
});

function toggleContextButtons() {
    const contextButtons = document.getElementById('context-buttons');
    const query = 'input[type="checkbox"][id^="cb_"]';

    let hasSelected = false;
    Array.from(document.querySelectorAll(query)).forEach(checkbox => {
        if (checkbox.checked) {
            hasSelected = true;
        }
    });
    contextButtons.style.display = hasSelected ? 'block' : 'none';
}

function getGroups() {
    const csrftoken = getCookie("csrftoken");
    fetch("/api/get-groups/", {
        method: "GET",
        headers: {
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "X-CSRFToken": csrftoken,
        },
    })
        .then((response) => response.json())
        .then((data) => {
            displayGroups(data.groups);
            if (data.groups.includes("Editors")) {
                isEditor = true;
            }
        })
        .catch((error) => {
            console.log(error);
        });
}

function displayGroups(groups) {
    const userGroups = document.getElementById("user-groups");
    let html = `<p class='groups-label'>Groups</p>`;
    groups.forEach((group) => {
        html += `<p class='group-name'>- ${group}</p>`;
    });
    userGroups.innerHTML = html;
}

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
    const searchBox = document.getElementById("search-box");
    let value = searchBox.value.trim();
    currentPage = 1;
    if (value.length == 0 || isValidTsQueryString(value)) {
        searchMedia(value, currentFolder);
    } else if (isUnquoted(value) && containsSpace(value)) {
        // make the search string a valid TsQuery. Assume OR.
        value = trimWhitespaces(value).replaceAll(" ", " | ");
        searchMedia(value, currentFolder);
    } else {
        alert("Invalid search string.");
    }
}

function updatePlaceholder() {
    const searchBox = document.getElementById("search-box");
    if (currentFolder == "/") {
        searchBox.placeholder = "[Search videos in all folders]";
    } else {
        searchBox.placeholder = `[Search videos in ${currentFolder}]`;
    }
}

function resetPage() {
    const searchBox = document.getElementById("search-box");
    searchBox.value = "";
    updatePlaceholder();
    currentPage = 1;
    searchMedia("", currentFolder);
}

function applyFilters() {
    $(document).ready(function () {
        const tableConfig = {
            paging: false,
            searching: false,
            ordering: true,
            info: false,
            order: [[0, "asc"]],
            columnDefs: [
                {
                    targets: Array.from(hiddenColumns).sort((a, b) => a - b),
                    visible: false,
                },
                {
                    targets: [1, 12, 13, 15, 16],
                    orderable: false
                }
            ]
        };

        if ($.fn.dataTable.isDataTable("#results-table")) {
            $("#results-table").DataTable().destroy();
        }

        // Initialize table with config
        $("#results-table").DataTable(tableConfig);

        // Add custom column visibility button
        addColumnVisibilityButton();
    });
}

// Add this new function to create and handle the custom button
function addColumnVisibilityButton() {

    // Create buttons for top and bottom controls
    const topButton = document.getElementById('column-filter-button');
    topButton.className = 'filter-button column-visibility-btn';
    topButton.textContent = COLUMN_FILTER_ICON;

    // Initialize the column visibility functionality
    initializeColumnVisibility();
}

function initializeColumnVisibility() {
    // Add click handler to both buttons
    document.querySelectorAll('.column-visibility-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const table = $('#results-table').DataTable();

            // Get all columns except the first one
            const columns = table.columns().indexes().toArray().slice(1);

            // Create popup menu for column selection
            const menu = document.createElement('div');
            menu.className = 'column-menu popup-visible';
            menu.style.position = 'absolute';
            menu.style.backgroundColor = 'white';
            menu.style.border = '1px solid #ccc';
            menu.style.padding = '10px';
            menu.style.zIndex = '1000';

            // Add checkboxes for each column
            columns.forEach(colIdx => {
                const col = table.column(colIdx);
                const div = document.createElement('div');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = col.visible();

                checkbox.addEventListener('change', function() {
                  col.visible(this.checked);
                  if (this.checked) {
                      if (hiddenColumns.has(colIdx))
                          hiddenColumns.delete(colIdx);
                  } else {
                      if (!hiddenColumns.has(colIdx))
                          hiddenColumns.add(colIdx);
                  }
                  setCookie('Library.hiddenColumns',JSON.stringify(Array.from(hiddenColumns)));
                });

                div.appendChild(checkbox);
                div.appendChild(document.createTextNode(' ' + $(col.header()).text()));
                menu.appendChild(div);
            });

            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.marginTop = '10px';
            closeBtn.addEventListener('click', () => menu.remove());
            menu.appendChild(closeBtn);

            // Position menu near the clicked button
            const rect = btn.getBoundingClientRect();
            menu.style.top = rect.bottom + 'px';
            menu.style.left = (rect.left-110) + 'px';

            // Remove any existing menus and add the new one
            document.querySelectorAll('.column-menu').forEach(m => m.remove());
            document.body.appendChild(menu);

            // Close menu when clicking outside
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target !== btn) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        });
    });
}

function browseFolder(folder_id=1) {
    const csrftoken = getCookie("csrftoken");
    const offset = (currentPage - 1) * maxRows;
    table = $("#results-table").DataTable();
    table.destroy();
    fetch(`/api/browse-folder/${folder_id}/`, {
        method: "GET",
        headers: {
            "X-CSRFToken": csrftoken,
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "Max-Rows": maxRows,
            "Start-From": offset,
        },
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                displayError(data.error);
            } else {
                recordSet = data.results;
                displayResults(data.results);
                displayResultsTiles(data.results);
                displayThumbnails(data.results);
            }
        })
        .catch((error) => {
            console.log(error);
            displayError("An error occurred while fetching data.");
        });
}

function searchMedia(pattern = "", scope = "/") {
    const csrftoken = getCookie("csrftoken");
    const offset = (currentPage - 1) * maxRows;
    table = $("#results-table").DataTable();
    table.destroy();
    fetch("/api/search-media/", {
        method: "GET",
        headers: {
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "Max-Rows": maxRows,
            "Start-From": offset,
            Pattern: pattern,
            Scope: scope,
            "Media-Type": "video,audio,photo,document",
            "X-CSRFToken": csrftoken,
        },
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                displayError(data.error);
            } else {
                recordSet = data.results;
                displayResults(data.results);
                displayResultsTiles(data.results);
                highlightWords(dequote(pattern));
                displayThumbnails(data.results);
            }
        })
        .catch((error) => {
            console.log(error);
            displayError("An error occurred while fetching data.");
        });
}

function openVideoPopup(videoUrl, startTime) {
    const popup = document.createElement("div");
    popup.className = "video-popup";
    popup.innerHTML = `
        <div class="popup-content">
          <button class="close-popup" onclick="closeVideoPopup()">X</button>
          <video controls >
            <source src="${videoUrl}#t=${startTime}" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>`;
    document.body.appendChild(popup);
}

function closeVideoPopup() {
    const popup = document.querySelector(".video-popup");
    if (popup) {
        popup.remove();
    }
}

function displayResultsTiles(data, append = false) {
    const resultsBodyTiles = document.getElementById("tiles-results");
    if (!resultsBodyTiles) {
        console.error("Element with ID 'tiles-results' not found");
        resultsBodyTiles.innerHTML = "No Records Found";
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        resultsBodyTiles.innerHTML = "No Records Found";
        return;
    }

    let html = "";

    data.forEach((item) => {
        html += `
        <div class="tile">
            <table class="tile_table">
            <tr class="title-field" data-file-id-tile="${item.file_id}" >
                <td class="tile-items">`;

        if (item.disabled) {
            html += `<p class="tile-icon">${DISABLED_ICON}</p>`;
        } else if (item.extension == 'FOLDER') {
            html += `<p class="tile-icon">${FOLDER_ICON}</p>`;
        } else if (item.media_type == 'audio') {
            html += `<p class="tile-icon">${AUDIO_ICON}</p>`;
        } else {
            html += `<img class="thumbnail" id="thumbnail_tiles_${item.file_id}" 
            src="" data-video-url="${item.file_url}" alt="thumbnail"
            onclick=displayAsset("${item.file_id}","${encodeURIComponent(item.file_name)}","${item.media_type}","${item.file_url}")>`;
        }

        html += `   <div>`;

        if (item.extension == 'FOLDER') {
            html += `<span class="tile-text" onclick=selectFolderByID(${item.file_id})>
                ${item.file_name}</span>`;
        } else {
            html += `<span class="tile-text" 
                onclick=displayAsset("${item.file_id}","${encodeURIComponent(item.file_name)}","${item.media_type}","${item.file_url}")>
                ${item.file_name}</span>`;
        }

        html += `   </div>`;

        if (item.extension != 'FOLDER') {
            html += `<div class="field_value">${formatSize(item.size)}</div>`;
        }

        html += `</td>
            </tr>
            </table>
        </div>`;
    });

    if (append) {
        resultsBodyTiles.innerHTML += html;
    } else {
        resultsBodyTiles.innerHTML = html;
    }

    const titles = document.querySelectorAll(".title-field");
    titles.forEach((title) => {
        title.addEventListener("dblclick", () => {
            const fileId = title.getAttribute("data-file-id-tile"); // Correctly fetch the file_id
            const titleText = title.getAttribute("data-title") || "No title";
            if (fileId) {
                window.open(
                    `/app/media-player/?file_id=${fileId}&file_name=video`,
                    "_blank"
                );
            } else {
                console.error("file_id is null or undefined.");
            }
        });
    });
}

function displayResults(results) {
    table = $("#results-table").DataTable();
    table.destroy();
    applyFilters();
    const resultsBody = document.getElementById("results-body");
    resultsBody.innerHTML = "";

    if (results == null) {
        resultsBody.innerHTML =
            '<tr><td colspan="21">API call returned null.</td></tr>';
        return;
    }

    if (results.length === 0) {
        resultsBody.innerHTML =
            '<tr><td colspan="1">No matching records found.</td></tr>';
        return;
    }

    results.forEach((item) => {
        const item_type = item.extension == 'FOLDER' ? 'folder' : 'file';
        const row = document.createElement("tr");
        row.id = `row_${item_type}_${item.file_id}`;

        let html = `
        <td><div class='select-cell'>
            <input type='checkbox' id='cb_${item_type}_${item.file_id}'
            data-item-type='${item_type}'
            data-item-id='${item.file_id}'
            data-item-name='${item.file_name}'
            onclick='toggleContextButtons()'>
            <label for='cb_${item_type}_${item.file_id}'>${item.file_id}</label></td>`;

        if (item.disabled) {
            html += `<td>${DISABLED_ICON}</td>`;
        } else if (item.extension == 'FOLDER') {
            html += `<td>${FOLDER_ICON}</td>`;
        } else if (item.media_type == 'audio') {
            html += `<td>${AUDIO_ICON}</td>`;
        } else if (item.media_type == 'document') {
            html += `<td>${FILE_ICON}</td>`;
        } else {
            html += `
            <td><img class="thumbnail thumbnail_tab" id="thumbnail_${item.file_id}" 
            src=""  data-video-url="${item.file_url}" alt="thumbnail" 
            onclick=displayAsset("${item.file_id}","${encodeURIComponent(item.file_name)}","${item.media_type}","${item.file_url}")>
            </td>`;
        }

        if (item.extension == 'FOLDER') {
            html += `<td id="item_name_${item_type}_${item.file_id}">
            <span style="cursor: pointer"
                onclick=selectFolderByID(${item.file_id})>
                ${item.file_name}</span></td>`;
        } else {
            html += `<td id="item_name_${item_type}_${item.file_id}">
            <span style="cursor: pointer"
                onclick=displayAsset("${item.file_id}","${encodeURIComponent(item.file_name)}","${item.media_type}","${item.file_url}")>
                ${item.file_name}</span></td>`;
        }

        html += `
        <td>${item.extension.toUpperCase().replaceAll(".", "")}</td>
        <td>${item.media_source}</td>
        <td>${formatSize(item.size)}</td>
        <td>${formatDate(item.date_created)}</td>
        <td>${formatDate(item.date_uploaded)}</td>
        <td>${formatDate(item.last_accessed)}</td>
        <td>${formatDate(item.last_modified)}</td>
        <td id='owner_name_${item_type}_${item.file_id}'>${coalesce(item.owner_name)}</td>
        <td id='group_name_${item_type}_${item.file_id}'>${coalesce(item.group_name)}</td>
        <td id='access_rights_${item_type}_${item.file_id}'>${accessRightsToStr(item.owner_rights,item.group_rights,item.domain_rights,item.public_rights)}</td>
        <td>${coalesce(item.remarks)}</td>
        <td>${item.version}</td>
        <td>${sanitizeJson(item.attributes)}</td>
        <td>${sanitizeJson(item.extra_data)}</td>
        <td>${item.ip_location}</td>
        <td>${item.file_status}</td>`;
        row.innerHTML = html;
        resultsBody.appendChild(row);
    });
}

document.getElementById("toggleViewBtn").addEventListener("click", function () {
    const tableView = document.getElementById("results");
    const tileView = document.getElementById("tiles-results");

    if (tableView.style.display === "none") {
        tableView.style.display = "block";
        tileView.style.display = "none";
        this.textContent = "Switch to Tile View"; // Update button text
    } else {
        tableView.style.display = "none";
        tileView.style.display = "flex";
        this.textContent = "Switch to Table View"; // Update button text
        // displayTileView(); // Function to populate tiles
    }
});

function displayThumbnails(results) {
    const csrftoken = getCookie("csrftoken");
    const NOTHUMBS = ['FOLDER','audio','document'];
    results.forEach((item) => {
        if (NOTHUMBS.includes(item.media_type)) {
            return;
        }
        fetch(`/api/get-thumbnail/${item.file_id}/`, {
            method: "GET",
            headers: {
                "Subscription-ID": SUBSCRIPTION_ID,
                "Client-Secret": CLIENT_SECRET,
                "X-CSRFToken": csrftoken,
            },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.blob(); // Get the image data as a blob
            })
            .then((blob) => {
                isValidJPEG(blob).then((isValid) => {
                    if (isValid) {
                        // Create a URL for the blob and display it as an image
                        const imageUrl = URL.createObjectURL(blob);
                        const imageObj1 = document.getElementById("thumbnail_" + item.file_id);
                        const imageObj2 = document.getElementById("thumbnail_tiles_" + item.file_id);
                        imageObj1.src = imageUrl;
                        imageObj2.src = imageUrl;
                    } else {
                        console.error("Invalid JPEG file");
                    }
                });
            })
            .catch((error) => {
                console.error("There was a problem with the fetch operation:", error);
                document.getElementById("imageDisplay").innerHTML =
                    "<p>Error loading image</p>";
            });
    });
}

function highlightWords(searchString) {
    if (searchString.length == 0) {
        //console.log('Nothing to highlight.');
        return;
    }
    const table = document.getElementById("results-table");
    const searchWords = searchString.toLowerCase().split(/\s+/);

    function highlightNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let content = node.textContent;
            let lowerContent = content.toLowerCase();
            let changed = false;

            for (let word of searchWords) {
                if (lowerContent.includes(word)) {
                    let regex = new RegExp(`(${word})`, "gi");
                    content = content.replace(regex, (match) => {
                        changed = true;
                        return `<span style="background-color: #808000;">${match}</span>`;
                    });
                }
            }

            if (changed) {
                let span = document.createElement("span");
                span.innerHTML = content;
                node.parentNode.replaceChild(span, node);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            for (let child of node.childNodes) {
                highlightNode(child);
            }
        }
    }

    const tdElements = table.getElementsByTagName("td");
    for (let td of tdElements) {
        highlightNode(td);
    }
}

function formatTime(seconds) {
    const sign = seconds < 0 ? "-" : "";
    seconds = Math.abs(seconds);

    return sign + new Date(seconds * 1000).toISOString().slice(11, 23);
}

function goToPage(direction) {
    switch (direction) {
        case "top":
            currentPage = 1;
            break;
        case "prev":
            if (currentPage > 1) {
                currentPage--;
            }
            break;
        case "next":
            currentPage++;
            break;
    }
    searchMedia(document.getElementById("search-box").value, currentFolder);
}

function displayError(message) {
    const resultsBody = document.getElementById("results-body");
    resultsBody.innerHTML = `<tr><td colspan="20">${message}</td></tr>`;
}

function fetchFolders(parent_id = 1) {
    const csrftoken = getCookie("csrftoken");
    return fetch(`/api/get-folders/${parent_id}/`, {
        method: "GET",
        headers: {
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "Parent-ID": parent_id,
            "Max-Rows": maxRows,
            "X-CSRFToken": csrftoken,
        },
    }).then((response) => response.json());
}

function createFolderElement(tree, folder) {
    const row = document.createElement("tr");
    const col = document.createElement("td");
    const icon = document.createElement("span");
    const label = document.createElement("span");
    row.appendChild(col);
    row.id = 'folder-branch-' + folder.folder_id;
    col.appendChild(icon);
    col.appendChild(label);
    col.classList.add("folder-label-icon");
    icon.innerHTML = FOLDER_ICON;
    icon.style.paddingLeft = folder.folder_level * FOLDER_WIDTH + "px";
    icon.setAttribute("folder_id", folder.folder_id);
    icon.classList.add("folder-icon");
    label.id = "folder-label-" + folder.folder_id;
    label.innerHTML = folder.name;
    label.setAttribute("folder_id", folder.folder_id);
    label.setAttribute("folder_level", folder.folder_level);
    label.setAttribute("folder_name", folder.name);
    label.setAttribute("is_open", "false");
    label.classList.add("folder-label");

    // Handle folder double-click to load subfolders
    icon.addEventListener("dblclick", function (event) {
        let lastRow = row;
        fetchFolders(folder.folder_id).then((subfolders) => {
            if (subfolders.results.length) {
                subfolders.results.forEach((subfolder) => {
                    const newRow = createFolderElement(tree, subfolder);
                    tree.insertBefore(newRow, lastRow.nextSibling);
                    lastRow = newRow;
                });
            }
            label.setAttribute("is_open","true");
        });
    });

    // Handle folder click to select the folder
    label.addEventListener("click", function (event) {
        folder["path_name"] = folder.path + folder.name;
        selectFolder(folder);
    });

    return row;
}

function getFolders(parent_id = 1, target='folder-browser', is_popup=true, reposition=true) {
    function createRootFolder() {
        const table = document.createElement("table");
        const row = document.createElement("tr");
        const col = document.createElement("td");
        const icon = document.createElement("span");
        const label = document.createElement("span");
        row.appendChild(col);
        col.appendChild(icon);
        col.appendChild(label);
        col.classList.add("folder-label-icon");
        table.appendChild(row);
        table.id = "folder-tree";
        icon.style.paddingLeft = "0px";
        icon.innerHTML = FOLDER_ICON;
        icon.setAttribute("folder_id", 1);
        icon.classList.add("folder-icon");
        label.innerHTML = "[all folders]";
        label.setAttribute("folder_id", 1);
        label.setAttribute("folder_level", 0);
        label.setAttribute("folder_name", "[all folders]");
        label.setAttribute("is_open", "true");
        label.classList.add("folder-label");

        // Handle folder click to select the folder
        label.addEventListener("click", function (event) {
            let folder = {
                folder_id: 1,
                path: "",
                name: "[all folders]",
                path_name: "/",
                folder_level: 0,
            };
            selectFolder(folder);
        });

        return table;
    }

    fetchFolders(parent_id)
        .then((folders) => {
            const folderBrowser = document.getElementById(target);
            folderBrowser.innerHTML = "";
            const rootFolder = createRootFolder();
            folderBrowser.appendChild(rootFolder);

            folders.results.forEach((folder) => {
                rootFolder.appendChild(createFolderElement(rootFolder, folder));
            });

            if (is_popup) {
                folderBrowser.classList.remove("folder-browser-hidden");
                folderBrowser.classList.add("folder-browser-visible");
            }

            if (reposition) {
                const breadCrumbs = document.getElementById("bread-crumbs");
                const rect = breadCrumbs.getBoundingClientRect();
                folderBrowser.style.top = rect.y + rect.height + "px";
                folderBrowser.style.left = rect.x + "px";
            }

            traverseCurrentFolder(currentFolder);
        })
        .catch((error) => {
            console.log(error);
            alert("An error occurred while fetching folders.");
        });
}

function traverseCurrentFolder(target_path, start_level=0) {
    const folderTree = document.getElementById('folder-tree');
    const folders = trimString(target_path,'/').split("/");
    const branches = folderTree.getElementsByClassName('folder-label');

    let parent_id = 1;
    let found = false;
    for (let i = start_level; i < folders.length; i++) {
        folder = folders[i];
        found = false;

        for (let j = 0; j < branches.length; j++) {
            branch = branches[j];
            branch_level = branch.getAttribute('folder_level');

            if (branch_level != (i+1)) continue;
            if (folder != branch.textContent) continue;
            
            found = true;
            parent_id = branch.getAttribute('folder_id');

            if (i == folders.length-1) {
                highlightSelectedFolder(parent_id);
            }

            break;
        }
        // There is no such branch. Must load this branch.
        if (!found) {
            break;
        }
    }

    // If found, it means all folders in the target path are in the folderTree
    if (found) {
        return;
    }

    const csrftoken = getCookie("csrftoken");
    fetch(`/api/get-folders/${parent_id}/`, {
        method: "GET",
        headers: {
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "Parent-ID": parent_id,
            "Max-Rows": maxRows,
            "X-CSRFToken": csrftoken,
        },
    })
    .then((response) => response.json())
    .then(folders => {
        folders.results.forEach((folder) => {
            const refRow = document.getElementById('folder-branch-'+parent_id);
            newRow = createFolderElement(folderTree, folder);
            folderTree.insertBefore(newRow, refRow.nextSibling);
        });
        const parentFolder = document.getElementById('folder-label-'+parent_id);
        parentFolder.setAttribute('is_open','true');
        traverseCurrentFolder(target_path, start_level+1);
    });
}

function addBranchFolder(parent_id, folder_id, folder_level, folder_name) {
    const branch = document.getElementById('folder-label-' + parent_id);
    if (!branch) return;
    if (branch.getAttribute('is_open') == 'false') return;
    const folder = { 
        'folder_id':folder_id, 
        'folder_level':folder_level,
        'name':folder_name
    };
    const folderTree = document.getElementById('folder-tree');
    const newRow = createFolderElement(folderTree, folder);
    const refRow = document.getElementById('folder-branch-'+parent_id);
    folderTree.insertBefore(newRow, refRow.nextSibling);
}

function selectFolderByID(folder_id) {
    const csrftoken = getCookie("csrftoken");
    fetch(`/api/get-folder/${folder_id}/`, {
        method: "GET",
        headers: {
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "X-CSRFToken": csrftoken,
        },
    })
    .then((response) => response.json())
    .then((data) => {
        if (data.error) {
            alert('Unable to get folder:' + data.error);
        } else {
            selectFolder(data.results[0]);
            traverseCurrentFolder(currentFolder);
        }
    });
}

function selectFolder(folder) {
    const folderBrowser = document.getElementById("folder-browser");
    if (folderBrowser.classList.contains("folder-browser-visible")) {
        folderBrowser.classList.remove("folder-browser-visible");
        folderBrowser.classList.add("folder-browser-hidden");
    }
    const breadCrumbs = document.getElementById("bread-crumbs");
    breadCrumbs.innerHTML = folder.path + folder.name;
    currentFolder = folder.path_name;
    currentFolderID = folder.folder_id;
    updatePlaceholder();
    browseFolder(folder.folder_id);
    applyFilters();
    highlightSelectedFolder(folder.folder_id);
    setCookie('Library.currentFolder',currentFolder,7*24*60*60);
    setCookie('Library.currentFolderID',currentFolderID,7*24*60*60);
}

function highlightSelectedFolder(folder_id) {
    const folderTree = document.getElementById('folder-tree');
    const branches = folderTree.getElementsByClassName('folder-label');
    for (let i = 0; i < branches.length; i++) {
        branch = branches[i];
        if (branch.getAttribute('folder_id') == folder_id) {
            branch.classList.add('folder-label-selected');
        } else {
            branch.classList.remove('folder-label-selected');
        }
    }
}

function setMaxRows(value) {
    maxRows = value;
    const maxRowsUL = document.getElementById("max-rows-options");
    const maxRowsLIs = maxRowsUL.querySelectorAll("li");
    maxRowsLIs.forEach((li) => {
        if (li.id == "li-" + maxRows.toString()) {
            li.style.listStyleType = "disc";
            setCookie("Library.maxRows",value);
        } else {
            li.style.listStyleType = "none";
        }
    });
}

function getFileCount(folder_id) {
    const csrftoken = getCookie("csrftoken");
    fetch(`/api/get-file-count/${folder_id}/`, {
        method: "GET",
        headers: {
            "Subscription-ID": SUBSCRIPTION_ID,
            "Client-Secret": CLIENT_SECRET,
            "Media-Type": "video",
            "X-CSRFToken": csrftoken,
        },
    })
        .then((response) => response.json())
        .then((data) => {
            totalFiles = data.result;
            document.getElementById("detail-file-count").innerHTML =
                data.result + " files)";
        })
        .catch((error) => {
            console.log(error);
        });
}

function createModalOverlay(title, ok_label, items, selection='dropdown') {
    // Create modal elements
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Modal header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.textContent = title;

    const closeButton = document.createElement('button');
    closeButton.className = 'modal-btn modal-btn-close';
    closeButton.textContent = 'X';

    // Modal subheader
    const subheader = document.createElement('div');
    subheader.className = 'modal-subheader';
    subheader.textContent = `${items.length} folders/files selected:`;

    // Modal body
    const body = document.createElement('div');
    body.className = 'modal-body';

    // File/Folder list
    let hasFolders = false;
    const itemList = document.createElement('div');
    itemList.className = 'item-list';
    items.forEach(([id,itemName,itemType]) => {
        if (itemType == 'folder') hasFolders = true;
        const itemElement = document.createElement('div');
        itemElement.className = 'item-list-item';
        itemElement.textContent = (itemType == 'file' ? FILE_ICON : FOLDER_ICON) + ' ' + itemName;
        itemElement.id = `item-list-item-${itemType}-${id}`;
        itemList.appendChild(itemElement);
    });

    let userSelect = null;
    if (selection == 'dropdown') {
        // User dropdown
        userSelect = document.createElement('select');
        userSelect.id = 'user-select';
        userSelect.className = 'user-select';
        userSelect.innerHTML = '<option value="">Select a user...</option>';
        userSelect.id = 'modal-dropdown';

    } else if (selection == 'checkboxes') {
        userSelect = document.createElement('div');
        userSelect.id = 'user-select';
        userSelect.className = 'modal-access';
        const labels = ['Owner','Group','Domain','Public'];
        const rights = ['Read','Write','Execute'];
        const defaultRights = ['Owner-Read','Owner-Write','Group-Read','Group-Write','Domain-Read'];
        let htmlStr = `<table class='access-rights'>`;
        labels.forEach(label => {
            htmlStr += `<tr><td>${label}:</td>`;
            for (let i=0; i<3; i++) {
                let id = `${label}-${rights[i]}`;
                htmlStr += `<td><input type='checkbox' id='${id}' 
                    ${defaultRights.includes(id) ? 'checked' : ''}>
                    <label for='${label}-${rights[i]}'>${rights[i]}</label></td>`;
            }
            htmlStr += '</tr>';
        });
        htmlStr += '</table>'
        userSelect.innerHTML = htmlStr;

    } else if (selection == 'textbox') {
        userSelect = document.createElement('input');
        userSelect.type = 'text';
        userSelect.id = 'user-select';
    }

    // Footer with buttons
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.id = 'modal-footer';

    const cbDiv = document.createElement('div');
    cbDiv.className = 'modal-cb-div';

    const checkBox = document.createElement('input');
    checkBox.type = 'checkbox';
    checkBox.id = 'modal-recursive';
    checkBox.disabled = !hasFolders || ok_label == 'Move';

    const cbLabel = document.createElement('label');
    cbLabel.htmlFor = 'modal-recursive';
    cbLabel.textContent = 'Apply action recursively';
    cbLabel.className = hasFolders && (ok_label != 'Move') ? 'modal-label' : 'modal-label-disabled';
    cbLabel.title = 'Applies the action to all subfolders and files under the selected folders.';
    cbLabel.disabled = !hasFolders || ok_label == 'Move';

    const okButton = document.createElement('button');
    okButton.className = 'modal-btn modal-btn-primary';
    okButton.textContent = ok_label;
    okButton.id = 'modal-ok-button';

    // Subfooter for error messages
    const statusbar = document.createElement('div');
    statusbar.className = 'modal-body';
    statusbar.id = 'modal-statusbar';

    // Assemble modal
    header.appendChild(closeButton);
    body.appendChild(itemList);
    body.appendChild(userSelect);
    cbDiv.appendChild(checkBox);
    cbDiv.appendChild(cbLabel);
    footer.appendChild(cbDiv);
    footer.appendChild(okButton);

    modalContent.appendChild(header);
    modalContent.appendChild(subheader);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    modalContent.appendChild(statusbar);
    modalOverlay.appendChild(modalContent);

    // Handle button clicks
    closeButton.onclick = () => {
        modalOverlay.remove();
    };

    return modalOverlay;
}

function renameItem() {
    const query = 'input[type="checkbox"]:checked[id^="cb_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes) {
        alert("No selected folder or file!");
        return;
    }

    const items = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-item-id'),
        cb.getAttribute('data-item-name'),
        cb.getAttribute('data-item-type')
    ]).sort((a, b) => a[1] < b[1]);

    const selectedItem = items[0];
    const newName = prompt(`Enter a new name for ${selectedItem[1]}`,selectedItem[1]);

    if (!newName) {
        return;
    }

    const csrftoken = getCookie("csrftoken");
    fetch(`/api/rename-${selectedItem[2]}/${selectedItem[0]}/`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify({ 'name': newName })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                const tdElement = document.getElementById(`item_name_${selectedItem[2]}_${selectedItem[0]}`);
                tdElement.innerHTML = tdElement.innerHTML.replace(selectedItem[1],newName);
                const cbElement = document.getElementById(`cb_${selectedItem[2]}_${selectedItem[0]}`);
                cbElement.setAttribute('data-item-name',newName);
            }
        })
        .catch(error => {
            alert('Unable to rename folder/file. Please try again.');
        });
}

function moveItem() {
    const query = 'input[type="checkbox"]:checked[id^="cb_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected file!");
        return;
    }

    const items = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-item-id'),
        cb.getAttribute('data-item-name'),
        cb.getAttribute('data-item-type')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Move Folders/Files','Move', items, 'textbox');
    document.body.appendChild(modalOverlay);

    const userSelect = document.getElementById('user-select');
    const okButton = document.getElementById('modal-ok-button');
    okButton.onclick = () => {
        const newPath = userSelect.value.trim();
        if (newPath.length == 0) {
            alert('Please input a new path.');
            return;
        }

        const csrftoken = getCookie("csrftoken");
        const moveFiles = async (items, folder_id) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const promises = items.map(([id, itemName, itemType]) => {        
                return fetch(`/api/move-${itemType}/${id}/${folder_id}/`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Subscription-ID': SUBSCRIPTION_ID,
                        'Client-Secret': CLIENT_SECRET,
                        'X-CSRFToken': csrftoken,
                    },
                })
                    .then(response => response.json())
                    .then((data) => {
                        const itemListItem = document.getElementById(`item-list-item-${itemType}-${id}`);
                        if (data.error) {
                            results.failed++;
                            results.errors.push({ id: id, itemName: itemName, error: data.error });
                            itemListItem.innerHTML += '&nbsp;&times;';
                        } else {
                            results.successful++;
                            itemListItem.innerHTML += '&nbsp;&check;';
                            document.getElementById(`row_${itemType}_${id}`).remove();
                        }
                    })
                    .catch(error => {
                        results.failed++;
                        results.errors.push({ id: id, itemName: itemName, error: error });
                    });
            });

            await Promise.all(promises);
            return results;
        };

        const footer = document.getElementById('modal-footer');
        fetch(`/api/get-folder-id/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({ 'path_name': newPath })
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert('No such folder exists.');
                } else {
                    const folder_id = data.folder_id;
                    moveFiles(items, folder_id)
                        .then(results => {
                            footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                            if (results.errors.length > 0) {
                                results.errors.map(({id, itemName, error}) => {
                                    const errMsg = document.createElement('div');
                                    errMsg.className = 'error-msg-item';
                                    errMsg.textContent = `${id}:${itemName}: ${error}`;
                                    document.getElementById('modal-statusbar').appendChild(errMsg);
                                });
                            }
                        });
                }
            })
            .catch(error => {
                console.log(error);
                alert('Unable to validate new folder. Try again.');
            });
    }
}

function setItemOwner() {
    const query = 'input[type="checkbox"]:checked[id^="cb_"]';
    const checkedItems = document.querySelectorAll(query);

    if (checkedItems.length == 0) {
        alert("No selected folder or file!");
        return;
    }

    const items = Array.from(checkedItems).map(cb => [
        cb.getAttribute('data-item-id'), 
        cb.getAttribute('data-item-name'),
        cb.getAttribute('data-item-type')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Set Folder/File Owner','Set Owner', items);
    document.body.appendChild(modalOverlay);

    // Fetch users
    const userSelect = document.getElementById('modal-dropdown');
    const csrftoken = getCookie("csrftoken");
    fetch('/api/get-users/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }
            return response.json();
        })
        .then(users => {
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.username;
                option.textContent = user.username;
                userSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Failed to fetch users:', error);
            modalOverlay.remove();
            alert('Failed to load users. Please try again.');
        });

    const okButton = document.getElementById('modal-ok-button');
    okButton.onclick = () => {
        const selectedUser = userSelect.value;
        if (!selectedUser) {
            alert('Please select a user');
            return;
        }

        const updateOwners = async (items, selectedUser) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const recursive = document.getElementById('modal-recursive').checked;
            const promises = items.map(([id, itemName, itemType]) => { 
                const endpoint = (itemType == 'file') ? 'set-file-owner' : 
                                 (recursive ? 'set-tree-owner' : 'set-folder-owner');
                return fetch(`/api/${endpoint}/${id}/${selectedUser}/`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Subscription-ID': SUBSCRIPTION_ID,
                        'Client-Secret': CLIENT_SECRET,
                        'X-CSRFToken': csrftoken,
                    },
                })
                    .then(response => response.json())
                    .then((data) => {
                        const itemListItem = document.getElementById(`item-list-item-${itemType}-${id}`);
                        if (data.error) {
                            results.failed++;
                            results.errors.push({ id: id, itemName: itemName, error: data.error });
                            itemListItem.innerHTML += '&nbsp;&times;';
                        } else {
                            results.successful++;
                            itemListItem.innerHTML += '&nbsp;&check;';
                            const ownerNameItem = document.getElementById(`owner_name_${itemType}_${id}`);
                            ownerNameItem.innerHTML = selectedUser;
                        }
                    })
                    .catch(error => {
                        results.failed++;
                        results.errors.push({ id: id, fileName: fileName, error: error });
                    });
            });

            await Promise.all(promises);
            return results;
        };

        const footer = document.getElementById('modal-footer');
        updateOwners(items, selectedUser)
            .then(results => {
                footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                if (results.errors.length > 0) {
                    results.errors.map(({id, itemName, error}) => {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'error-msg-item';
                        errMsg.textContent = `${id}:${itemName}: ${error}`;
                        document.getElementById('modal-statusbar').appendChild(errMsg);
                    });
                }
            });
    };
}

function setItemGroup() {
    const query = 'input[type="checkbox"]:checked[id^="cb_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected folder or file!");
        return;
    }

    const items = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-item-id'),
        cb.getAttribute('data-item-name'),
        cb.getAttribute('data-item-type')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Set Folder/File Group','Set Group', items);
    document.body.appendChild(modalOverlay);

    // Fetch groups
    const groupSelect = document.getElementById('modal-dropdown');
    const csrftoken = getCookie("csrftoken");
    fetch('/api/get-all-groups/', {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }
            return response.json();
        })
        .then(groups => {
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.name;
                option.textContent = group.name;
                groupSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Failed to fetch groups:', error);
            modalOverlay.remove();
            alert('Failed to load groups. Please try again.');
        });

    const okButton = document.getElementById('modal-ok-button');
    okButton.onclick = () => {
        const selectedGroup = groupSelect.value;
        if (!selectedGroup) {
            alert('Please select a group');
            return;
        }

        const updateGroups = async (items, selectedGroup) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const recursive = document.getElementById('modal-recursive').checked;
            const promises = items.map(([id, itemName, itemType]) => {        
                const endpoint = (itemType == 'file') ? 'set-file-group' : 
                                 (recursive ? 'set-tree-group' : 'set-folder-group');
                return fetch(`/api/${endpoint}/${id}/${selectedGroup}/`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Subscription-ID': SUBSCRIPTION_ID,
                        'Client-Secret': CLIENT_SECRET,
                        'X-CSRFToken': csrftoken,
                    },
                })
                    .then(response => response.json())
                    .then((data) => {
                        const itemListItem = document.getElementById(`item-list-item-${itemType}-${id}`);
                        if (data.error) {
                            results.failed++;
                            results.errors.push({ id: id, itemName: itemName, error: data.error });
                            itemListItem.innerHTML += '&nbsp;&times;';
                        } else {
                            results.successful++;
                            itemListItem.innerHTML += '&nbsp;&check;';
                            const groupNameItem = document.getElementById(`group_name_${itemType}_${id}`);
                            groupNameItem.innerHTML = selectedGroup;
                        }
                    })
                    .catch(error => {
                        results.failed++;
                        results.errors.push({ id: id, itemName: itemName, error: error });
                    });
            });

            await Promise.all(promises);
            return results;
        };

        const footer = document.getElementById('modal-footer');
        updateGroups(items, selectedGroup)
            .then(results => {
                footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                if (results.errors.length > 0) {
                    results.errors.map(({id, itemName, error}) => {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'error-msg-item';
                        errMsg.textContent = `${id}:${itemName}: ${error}`;
                        document.getElementById('modal-statusbar').appendChild(errMsg);
                    });
                }
            });
    };
}

function setItemAccess() {
    let query = 'input[type="checkbox"]:checked[id^="cb_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected folder or file!");
        return;
    }

    const items = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-item-id'),
        cb.getAttribute('data-item-name'),
        cb.getAttribute('data-item-type')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Set Folder/File Access','Set Access', items, 'checkboxes');
    document.body.appendChild(modalOverlay);

    const okButton = document.getElementById('modal-ok-button');
    const userSelect = document.getElementById('user-select');
    okButton.onclick = () => {
        query = 'input[type="checkbox"]:checked';
        const checkedRights = userSelect.querySelectorAll(query);
        if (!checkedRights.length) {
            if (!confirm('All access rights will be removed. Continue?'))
                return;
        }

        const rwx = Array.from(checkedRights).map(cb => cb.id).sort((a, b) => a < b);
        const ownerRights = 4*rwx.includes('Owner-Read') + 2*rwx.includes('Owner-Write') 
            + rwx.includes('Owner-Execute');
        const groupRights = 4*rwx.includes('Group-Read') + 2*rwx.includes('Group-Write') 
            + rwx.includes('Group-Execute');
        const domainRights = 4*rwx.includes('Domain-Read') + 2*rwx.includes('Domain-Write') 
            + rwx.includes('Domain-Execute');
        const publicRights = 4*rwx.includes('Public-Read') + 2*rwx.includes('Public-Write') 
            + rwx.includes('Public-Execute');

        const updateAccess = async (items, o_r, g_r, d_r, p_r) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const recursive = document.getElementById('modal-recursive').checked;
            const csrftoken = getCookie("csrftoken");
            const promises = items.map(([id, itemName, itemType]) => {        
                const endpoint = (itemType == 'file') ? 'set-file-permission' : 
                                 (recursive ? 'set-tree-permission' : 'set-folder-permission');
                return fetch(`/api/${endpoint}/${id}/${o_r}/${g_r}/${d_r}/${p_r}/`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Subscription-ID': SUBSCRIPTION_ID,
                        'Client-Secret': CLIENT_SECRET,
                        'X-CSRFToken': csrftoken,
                    },
                })
                    .then(response => response.json())
                    .then((data) => {
                        const itemListItem = document.getElementById(`item-list-item-${itemType}-${id}`);
                        if (data.error) {
                            results.failed++;
                            results.errors.push({ id: id, itemName: itemName, error: data.error });
                            itemListItem.innerHTML += '&nbsp;&times;';
                        } else {
                            results.successful++;
                            itemListItem.innerHTML += '&nbsp;&check;';
                            const accessRightsItem = document.getElementById(`access_rights_${itemType}_${id}`);
                            accessRightsItem.innerHTML = accessRightsToStr(o_r,g_r,d_r,p_r);
                        }
                    })
                    .catch(error => {
                        results.failed++;
                        results.errors.push({ id: id, itemName: itemName, error: error });
                    });
            });

            await Promise.all(promises);
            return results;
        };

        const footer = document.getElementById('modal-footer');
        updateAccess(items, ownerRights, groupRights, domainRights, publicRights)
            .then(results => {
                footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                if (results.errors.length > 0) {
                    results.errors.map(({id, itemName, error}) => {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'error-msg-item';
                        errMsg.textContent = `${id}:${itemName}: ${error}`;
                        document.getElementById('modal-statusbar').appendChild(errMsg);
                    });
                }
            });
    };
}

function createFolder() {
    // Create modal elements
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    // Modal header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.textContent = 'Create new folder in ' + currentFolder;

    const closeButton = document.createElement('button');
    closeButton.className = 'btn btn-primary';
    closeButton.textContent = 'X';

    // Modal body
    const body = document.createElement('div');
    body.className = 'modal-body';

    // Folder details
    const folderName = document.createElement('input');
    folderName.type = 'text';
    folderName.id = 'new-folder-name';
    folderName.className = 'modal-input';

    const folderNameLabel = document.createElement('label');
    folderNameLabel.htmlFor = 'new-folder-name';
    folderNameLabel.textContent = 'Name:';

    const folderDesc = document.createElement('textarea');
    folderDesc.rows = 3;
    folderDesc.id = 'new-folder-desc';
    folderDesc.className = 'modal-input';

    const folderDescLabel = document.createElement('label');
    folderDescLabel.htmlFor = 'new-folder-desc';
    folderDescLabel.textContent = 'Description:';

    // Footer with buttons
    const footer = document.createElement('div');
    footer.className = 'modal-footer-single';
    footer.textContent = ' ';
    footer.id = 'modal-footer';

    const okButton = document.createElement('button');
    okButton.className = 'btn btn-primary';
    okButton.textContent = 'Create';
    okButton.id = 'modal-ok-button';

    // Subfooter for error messages
    const statusbar = document.createElement('div');
    statusbar.className = 'modal-body';
    statusbar.id = 'modal-statusbar';

    // Assemble modal
    header.appendChild(closeButton);
    body.appendChild(folderNameLabel);
    body.appendChild(folderName);
    body.appendChild(folderDescLabel);
    body.appendChild(folderDesc);
    footer.appendChild(okButton);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    modalContent.appendChild(statusbar);
    modalOverlay.appendChild(modalContent);

    // Handle button clicks
    closeButton.onclick = () => {
        modalOverlay.remove();
    };

    okButton.onclick = () => {
        const newName = folderName.value.trim();
        if (newName.length == 0) {
            alert('You must enter a folder name.');
            return;
        }

        const csrftoken = getCookie("csrftoken");
        fetch(`/api/create-folder/${currentFolderID}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
                'X-CSRFToken': csrftoken,
            },
            body: JSON.stringify({ 'name': newName, 'description': folderDesc.value })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                browseFolder(currentFolderID); // The lazy way to show the added folder.
                addBranchFolder(currentFolderID, data.result, data.folder_level, newName);
                modalOverlay.remove();
            }
        })
        .catch(error => {
            alert('Unable to rename folder/file. Please try again.');
        });
    }

    document.body.appendChild(modalOverlay);
    folderName.focus();
}

function displayAsset(file_id, filename, type, source) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'viewer-overlay';
    modalOverlay.setAttribute('file_id', file_id);

    // Viewer header
    const header = document.createElement('div');
    header.className = 'viewer-header';
    modalOverlay.appendChild(header);

    const title = document.createElement('span');
    title.id = 'viewer-title';
    title.textContent = decodeURIComponent(filename);
    header.appendChild(title);

    const ctrlButtons = document.createElement('span');
    ctrlButtons.className = 'viewer-controls';
    header.appendChild(ctrlButtons);

    const filePosition = document.createElement('p');
    filePosition.id = 'viewer-file-position';
    filePosition.className = 'viewer-nav-info';
    filePosition.textContent = '(1 of ';
    filePosition.style.display = 'none';
    ctrlButtons.appendChild(filePosition);

    const fileCount = document.createElement('p');
    fileCount.id = 'viewer-file-count';
    fileCount.className = 'viewer-nav-info';
    fileCount.textContent = '10)';
    fileCount.style.display = 'none';
    ctrlButtons.appendChild(fileCount);

    const firstButton = document.createElement('button');
    firstButton.className = 'viewer-nav-button';
    firstButton.textContent = FIRST_ICON;
    firstButton.onclick = function() { displayFirstAsset(modalOverlay); }
    ctrlButtons.appendChild(firstButton);

    const prevButton = document.createElement('button');
    prevButton.className = 'viewer-nav-button';
    prevButton.textContent = PREV_ICON;
    prevButton.onclick = function() { displayPreviousAsset(modalOverlay); }
    ctrlButtons.appendChild(prevButton);

    const nextButton = document.createElement('button');
    nextButton.className = 'viewer-nav-button';
    nextButton.textContent = NEXT_ICON;
    nextButton.onclick = function() { displayNextAsset(modalOverlay); }
    ctrlButtons.appendChild(nextButton);

    const lastButton = document.createElement('button');
    lastButton.className = 'viewer-nav-button';
    lastButton.textContent = LAST_ICON;
    lastButton.onclick = function() { displayLastAsset(modalOverlay); }
    ctrlButtons.appendChild(lastButton);

    const closeButton = document.createElement('button');
    closeButton.className = 'viewer-close-button';
    closeButton.textContent = CLOSE_ICON;
    closeButton.onclick = function() { modalOverlay.remove(); }
    ctrlButtons.appendChild(closeButton);

    // Viewer content
    const content = document.createElement('div');
    content.className = 'viewer-content';
    modalOverlay.appendChild(content);

    // Content left panel
    const leftPanel = document.createElement('div');
    leftPanel.className = 'viewer-left-panel';
    content.appendChild(leftPanel);

    // Media container
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'media-container';
    mediaContainer.id = 'media-container';
    mediaContainer.setAttribute('media_type', type);
    leftPanel.appendChild(mediaContainer);

    // Create asset element
    const photoAsset = document.createElement('img');
    photoAsset.className = 'viewer-asset-photo viewer-asset-holder';
    photoAsset.id = 'viewer-asset-photo';
    photoAsset.style.display = 'none';
    photoAsset.style.visibility = 'hidden';

    const videoAsset = document.createElement('video');
    videoAsset.className = 'viewer-asset-video viewer-asset-holder';
    videoAsset.id = 'viewer-asset-video';
    videoAsset.style.display = 'none';
    videoAsset.style.visibility = 'hidden';
    videoAsset.autoplay = false;

    const audioAsset = document.createElement('audio');
    audioAsset.className = 'viewer-asset-audio viewer-asset-holder';
    audioAsset.id = 'viewer-asset-audio';
    audioAsset.style.display = 'none';
    audioAsset.style.visibility = 'hidden';
    audioAsset.autoplay = false;

    const docAsset = document.createElement('iframe');
    docAsset.className = 'viewer-asset-document viewer-asset-holder';
    docAsset.id = 'viewer-asset-document';
    docAsset.style.display = 'none';
    docAsset.style.visibility = 'hidden';

    let assetElement = null;
    if (type === 'photo') {
        assetElement = photoAsset;
    } else if (type === 'video') {
        assetElement = videoAsset;
        assetElement.controls = true;
    } else if (type === 'audio') {
        assetElement = audioAsset;
        assetElement.controls = true;
    } else if (type === 'document') {
        assetElement = docAsset;
        assetElement.style.width = "100%";
        assetElement.style.height = "100%";
    }

    assetElement.src = source;
    assetElement.style.display = 'block';
    assetElement.style.visibility = 'visible';
    mediaContainer.appendChild(photoAsset);
    mediaContainer.appendChild(videoAsset);
    mediaContainer.appendChild(audioAsset);
    mediaContainer.appendChild(docAsset);

    // Content right panel
    const rightPanel = document.createElement('div');
    rightPanel.className = 'viewer-right-panel';
    rightPanel.id = 'asset-details';
    content.appendChild(rightPanel);

    // Right panel tabs
    const tabs = document.createElement('div');
    rightPanel.appendChild(tabs);
    tabs.className = 'asset-tabs';
    tabs.id = 'asset-tabs';
    tabs.setAttribute('file_id', file_id);

    const btnBasic = document.createElement('button');
    btnBasic.textContent = 'Basic';
    btnBasic.className = 'asset-tab asset-tab-selected';
    btnBasic.id = 'asset-tab-basic';
    btnBasic.onclick = function() { showAssetTab('basic'); };
    tabs.appendChild(btnBasic);

    const btnISO = document.createElement('button');
    btnISO.textContent = 'ISO';
    btnISO.className = 'asset-tab asset-tab-unselected';
    btnISO.id = 'asset-tab-iso';
    btnISO.onclick = function() { showAssetTab('iso'); };
    tabs.appendChild(btnISO);

    const btnExtras = document.createElement('button');
    btnExtras.textContent = 'Extras';
    btnExtras.className = 'asset-tab asset-tab-unselected';
    btnExtras.id = 'asset-tab-extras';
    btnExtras.onclick = function() { showAssetTab('extras'); };
    tabs.appendChild(btnExtras);

    const btnAudit = document.createElement('button');
    btnAudit.textContent = 'Audit';
    btnAudit.className = 'asset-tab asset-tab-unselected';
    btnAudit.id = 'asset-tab-audit';
    btnAudit.setAttribute('file_id', file_id);
    btnAudit.setAttribute('initialized', 'false');
    btnAudit.onclick = function() { showAssetTab('audit'); };
    tabs.appendChild(btnAudit);

    const btnTranscript = document.createElement('button');
    btnTranscript.textContent = 'Transcript';
    btnTranscript.className = 'asset-tab asset-tab-unselected';
    btnTranscript.id = 'asset-tab-transcript';
    btnTranscript.setAttribute('file_id', file_id);
    btnTranscript.setAttribute('initialized', 'false');
    btnTranscript.onclick = function() { showAssetTab('transcript'); };
    tabs.appendChild(btnTranscript);

    displayAssetInfo(rightPanel, file_id);
    displayNavInfo(filePosition, fileCount, file_id);

    document.body.appendChild(modalOverlay);
}

function displayAssetInfo(container, file_id, activeTab='basic') {
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
            console.log(data.error);
        } else {
            if (data.results.length > 0) {
                showAssetDetails(container, data.results[0], activeTab);
            } else {
                alert('Record not found.');
            }
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function showAssetDetails(container, data, activeTab='basic') {

    const editableKeys = ['file_name','media_source','description','tags','people','places','texts',
                          'remarks','title','creator','subject','publisher','contributor','identifier',
                          'source','language','relation','coverage','rights'];

    function pairsToRows(table, jsonData, inclusions, titlecase=true, 
                         editAll=false, parentKey='', showCheckBoxes=false) {
        for (const [key, value] of Object.entries(jsonData)) {
            if (inclusions) {
                if (!inclusions.includes(key)) {
                    continue;
                }
            }

            const row = document.createElement("tr");
            
            const keyCell = document.createElement("td");
            keyCell.textContent = titlecase ? toTitleCase(key.replace('_',' ')) : key;
            keyCell.className = 'asset-details-key';
            
            const valueCell = document.createElement("td");
            valueCell.id = 'value-cell-' + key;
            valueCell.textContent = value;
            valueCell.className = 'asset-details-value';
            
            if (editableKeys.includes(key) || editAll) {
                keyCell.classList.add('editable-key');
                valueCell.classList.add('editable-value');
                valueCell.setAttribute('key',key);
                valueCell.setAttribute('parent-key',parentKey);
                valueCell.addEventListener('dblclick', () => showEditor(valueCell));
            }

            if (showCheckBoxes) {
                const cbCell = document.createElement("td");
                const checkBox = document.createElement('input');
                checkBox.id = 'asset-detail-' + parentKey + '-' + key;
                checkBox.type = 'checkbox';
                cbCell.appendChild(checkBox);
                cbCell.className = 'asset-details-checkbox';
                row.appendChild(cbCell);
            }

            row.appendChild(keyCell);
            row.appendChild(valueCell);
            table.appendChild(row);
        }
    }

    const tabs = document.getElementById('asset-tabs');
    tabs.setAttribute('activeTab', activeTab);

    // Setup Basic tab
    const basicKeys = ['file_id','file_name','folder_name','extension','media_type','media_source','size',
                       'file_url','archive_url','storage_key','date_created','date_uploaded','description',
                       'tags','people','places','texts',
                       'last_accessed','last_modified','owner_id','owner_name','group_id','group_name',
                       'owner_rights','group_rights','domain_rights','ip_location','remarks',
                       'version','file_status','disabled'];
    const tableBasic = document.createElement("table");
    tableBasic.className = 'asset-details';
    tableBasic.id = 'asset-details-basic';
    tableBasic.style.display = activeTab == 'basic' ? 'table' : 'none';
    pairsToRows(tableBasic, data, basicKeys);
    container.appendChild(tableBasic);

    // Setup ISO tab
    const isoKeys = ['file_id','file_name','title','creator','subject','description','publisher',
                     'contributor','date_created','media_type','media_source','identifier','source',
                     'language','relation','coverage','rights'];
    const tableISO = document.createElement('table');
    tableISO.className = 'asset-details';
    tableISO.id = 'asset-details-iso';
    tableISO.style.display = activeTab == 'iso' ? 'table' : 'none';
    pairsToRows(tableISO, data, isoKeys);
    container.appendChild(tableISO);

    // Setup Extras tab
    const divExtras = document.createElement('div');
    divExtras.id = 'asset-details-extras';
    divExtras.style.display = activeTab == 'extras' ? 'block' : 'none';

    // Setup Extras-Attributes section
    const labelAttributes = document.createElement('p');
    labelAttributes.textContent = 'Attributes';
    labelAttributes.className = 'asset-label';
    divExtras.appendChild(labelAttributes);

    const tableAttributes = document.createElement('table');
    tableAttributes.className = 'asset-details';
    tableAttributes.id = 'asset-details-attributes';
    if (data.attributes) {
        pairsToRows(tableAttributes, JSON.parse(data.attributes), null, false);
    }
    divExtras.appendChild(tableAttributes);

    // Setup Extras-Extradata section
    const divExtraData = document.createElement('div');
    divExtraData.className = 'asset-extradata-div';
    divExtras.appendChild(divExtraData);

    const labelExtraData = document.createElement('span');
    labelExtraData.textContent = 'Extra Data';
    labelExtraData.className = 'asset-label';
    divExtraData.appendChild(labelExtraData);

    const spanEDButtons = document.createElement('span');
    divExtraData.appendChild(spanEDButtons);

    const btnAddExtraData = document.createElement('button');
    btnAddExtraData.textContent = ADD_ICON;
    btnAddExtraData.className = 'extradata-buttons';
    btnAddExtraData.onclick = function() { addKeyValuePair(); };
    spanEDButtons.appendChild(btnAddExtraData);

    const btnRemoveExtraData = document.createElement('button');
    btnRemoveExtraData.textContent = REMOVE_ICON;
    btnRemoveExtraData.className = 'extradata-buttons';
    btnRemoveExtraData.onclick = function() { removeKeyValuePair(); };
    spanEDButtons.appendChild(btnRemoveExtraData);

    const tableExtraData = document.createElement('table');
    tableExtraData.className = 'asset-details';
    tableExtraData.id = 'asset-details-extra_data';
    if (data.extra_data) {
        tableExtraData.setAttribute('extra_data', data.extra_data);
        pairsToRows(tableExtraData, JSON.parse(data.extra_data), null, false, true, 'extra_data', true);
    }
    divExtras.appendChild(tableExtraData);

    container.appendChild(divExtras);

    const divAudit = document.createElement('div');
    divAudit.id = 'asset-details-audit-div';
    divAudit.style.display = activeTab == 'audit' ? 'table' : 'none';
    divAudit.className = 'asset-audit-div';

    const tableAudit = document.createElement('table');
    tableAudit.className = 'asset-audit-table';
    tableAudit.id = 'asset-details-audit';
    tableAudit.innerHTML = '<tr><td>Display audit history here.</td></tr>';
    divAudit.appendChild(tableAudit);

    container.appendChild(divAudit);

    const divTranscript = document.createElement('div');
    divTranscript.id = 'asset-details-transcript-div';
    divTranscript.style.display = activeTab == 'transcript' ? 'table' : 'none';
    divTranscript.className = 'asset-transcript-div';

    const tableTranscript = document.createElement('table');
    tableTranscript.className = 'asset-transcript-table'; 
    tableTranscript.id = 'asset-details-transcript';
    tableTranscript.innerHTML = '<tr><td>Display transcript here.</td></tr>';
    divTranscript.appendChild(tableTranscript);

    container.appendChild(divTranscript);

    if (activeTab == 'audit' || activeTab == 'transcript') showAssetTab(activeTab);
}

function showAssetTab(tab) {
    const tabs = document.getElementById('asset-tabs');
    tabs.setAttribute('activeTab', tab);

    const tabBasic = document.getElementById('asset-tab-basic');
    const tabISO = document.getElementById('asset-tab-iso');
    const tabExtras = document.getElementById('asset-tab-extras');
    const tabAudit = document.getElementById('asset-tab-audit');
    const tabTranscript = document.getElementById('asset-tab-transcript');

    const tableBasic = document.getElementById('asset-details-basic');
    const tableISO = document.getElementById('asset-details-iso');
    const divExtras = document.getElementById('asset-details-extras');
    const divAudit = document.getElementById('asset-details-audit-div');
    const divTranscript = document.getElementById('asset-details-transcript-div');

    if (tab == 'basic' && tableBasic) {
        tabBasic.classList.remove('asset-tab-unselected');
        tabISO.classList.remove('asset-tab-selected');
        tabExtras.classList.remove('asset-tab-selected');
        tabAudit.classList.remove('asset-tab-selected');
        tabTranscript.classList.remove('asset-tab-selected');

        tabBasic.classList.add('asset-tab-selected');
        tabISO.classList.add('asset-tab-unselected');
        tabExtras.classList.add('asset-tab-unselected');
        tabAudit.classList.add('asset-tab-unselected');
        tabTranscript.classList.add('asset-tab-unselected');

        tableBasic.style.display = 'table';
        tableISO.style.display = 'none';
        divExtras.style.display = 'none';
        divAudit.style.display = 'none';
        divTranscript.style.display = 'none';

    } else if (tab == 'iso') {
        tabBasic.classList.remove('asset-tab-selected');
        tabISO.classList.remove('asset-tab-unselected');
        tabExtras.classList.remove('asset-tab-selected');
        tabAudit.classList.remove('asset-tab-selected');
        tabTranscript.classList.remove('asset-tab-selected');

        tabBasic.classList.add('asset-tab-unselected');
        tabISO.classList.add('asset-tab-selected');
        tabExtras.classList.add('asset-tab-unselected');
        tabAudit.classList.add('asset-tab-unselected');
        tabTranscript.classList.add('asset-tab-unselected');

        tableBasic.style.display = 'none';
        tableISO.style.display = 'table';
        divExtras.style.display = 'none';
        divAudit.style.display = 'none';
        divTranscript.style.display = 'none';

    } else if (tab == 'extras') {
        tabBasic.classList.remove('asset-tab-selected');
        tabISO.classList.remove('asset-tab-selected');
        tabExtras.classList.remove('asset-tab-unselected');
        tabAudit.classList.remove('asset-tab-selected');
        tabTranscript.classList.remove('asset-tab-selected');

        tabBasic.classList.add('asset-tab-unselected');
        tabISO.classList.add('asset-tab-unselected');
        tabExtras.classList.add('asset-tab-selected');
        tabAudit.classList.add('asset-tab-unselected');
        tabTranscript.classList.add('asset-tab-unselected');

        tableBasic.style.display = 'none';
        tableISO.style.display = 'none';
        divExtras.style.display = 'block';
        divAudit.style.display = 'none';
        divTranscript.style.display = 'none';

    } else if (tab == 'audit') {
        if (tabAudit.getAttribute('initialized') == 'false') {
            showAssetAudit(tabs.getAttribute('file_id'));
        }

        tabBasic.classList.remove('asset-tab-selected');
        tabISO.classList.remove('asset-tab-selected');
        tabExtras.classList.remove('asset-tab-selected');
        tabAudit.classList.remove('asset-tab-unselected');
        tabTranscript.classList.remove('asset-tab-selected');

        tabBasic.classList.add('asset-tab-unselected');
        tabISO.classList.add('asset-tab-unselected');
        tabExtras.classList.add('asset-tab-unselected');
        tabAudit.classList.add('asset-tab-selected');
        tabTranscript.classList.add('asset-tab-unselected');

        tableBasic.style.display = 'none';
        tableISO.style.display = 'none';
        divExtras.style.display = 'none';
        divAudit.style.display = 'table';
        divTranscript.style.display = 'none';

    } else if (tab == 'transcript') {
        if (tabTranscript.getAttribute('initialized') == 'false') {
            showAssetTranscript(tabs.getAttribute('file_id'));
        }

        tabBasic.classList.remove('asset-tab-selected');
        tabISO.classList.remove('asset-tab-selected');
        tabExtras.classList.remove('asset-tab-selected');
        tabAudit.classList.remove('asset-tab-selected');
        tabTranscript.classList.remove('asset-tab-unselected');

        tabBasic.classList.add('asset-tab-unselected');
        tabISO.classList.add('asset-tab-unselected');
        tabExtras.classList.add('asset-tab-unselected');
        tabAudit.classList.add('asset-tab-unselected');
        tabTranscript.classList.add('asset-tab-selected');

        tableBasic.style.display = 'none';
        tableISO.style.display = 'none';
        divExtras.style.display = 'none';
        divAudit.style.display = 'none';
        divTranscript.style.display = 'table';
    }
}

function showAssetAudit(file_id) {
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
        alert(error.message);
    });
}

function displayAudit(results) {
    const tableAudit = document.getElementById('asset-details-audit');

    // Construct table header
    let html = '<tr><th>ID</th><th>User</th><th>Activity</th><th>Timestamp</th>';
    html += '<th>Location</th><th>Old Data</th><th>New Data</th></tr>';

    results.forEach(item => {
        html += `<tr>
            <td>${item.audit_id}</td>
            <td>${item.username}</td>
            <td>${item.activity}</td>
            <td>${item.event_timestamp.replace('T',' ').substring(0,23)}</td>
            <td>${item.location}</td>
            <td>${item.old_data}</td>
            <td>${item.new_data}</td>
        </tr>`;
    });

    tableAudit.innerHTML = html;

    const tabAudit = document.getElementById('asset-tab-audit');
    tabAudit.setAttribute('initialized', 'true');
}

function showAssetTranscript(file_id) {
    function findChunk(chunks, cue_start) { 
        for (let i = 0; i < chunks.length; i++) {
            let chunk = chunks[i];
            if (chunk.time_start <= cue_start && cue_start <= chunk.time_end) {
                return chunk;
            } 
        }       
        return null;
    }

    function colorizeCues(file_id, chunk_ratings) {
        document.querySelectorAll('[id^="cue-conf-"]').forEach(element => {
            const cueStartStr = element.getAttribute('data-cuestart');
            if (cueStartStr) {
                const cueStart = timeStringToSeconds(element.getAttribute('data-cuestart'));
                const chunk = findChunk(chunk_ratings, cueStart);
                if (chunk) {
                    element.style.backgroundColor = ratingToColor(chunk.confidence);
                }
            }
        });
    }

    function getChunkRatings(file_id) {
        const csrftoken = getCookie('csrftoken');
        fetch(`/api/get-chunk-ratings/${file_id}/`, {
            method: 'GET',
            headers: {
                'X-CSRFToken': csrftoken,
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.log(data.error);
            } else {
                colorizeCues(file_id, data.results);
            }
        })
        .catch(error => {
            console.log(error);
        });
    }

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-transcript/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Unknown error occurred.');
            });
        }
        return response.json();
    })
    .then(data => {
        displayTranscript(data);
        getChunkRatings(file_id);
    })
    .catch(error => {
        const divTranscript = document.getElementById('asset-details-transcript-div');
        divTranscript.innerHTML = error.message;
    });
}

function displayTranscript(data) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const headerDiv = document.getElementById('header');
    const transcript = document.getElementById('asset-details-transcript-div');

    let webvtt = data.transcript[0].webvtt;
    transcript.innerHTML = vttToHTML(webvtt);
    transcript.style.height = (viewportHeight-3*headerDiv.style.height) + 'px';

    const editables = document.getElementsByClassName('cue-text');
    Array.from(editables).forEach(editable => {
        editable.addEventListener('dblclick', () => showEditor(editable))
    });

    const timeRanges = document.getElementsByClassName('cue-timestamp');
    Array.from(timeRanges).forEach(timeRange => {
        timeRange.addEventListener('dblclick', () => {
            const timeStart = timeStringToSeconds(timeRange.innerHTML.substring(0,12));
            const playerName = (q_file_name == 'video') ? 'video-player' : 'audio-player';
            const player = document.getElementById(playerName);
            player.currentTime = timeStart;
            player.play();
        });
    });

    transcript.addEventListener('keydown', (event) => {
       if (event.key == ' ' && event.target.tagName != 'INPUT' && event.target.tagName != 'TEXTAREA') {
            event.preventDefault();
       }
    });

    const tabTranscript = document.getElementById('asset-tab-transcript');
    tabTranscript.setAttribute('initialized', 'true');
}

function displayAdjacentAsset(modalOverlay, file_id, folder_id, direction) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-adjacent-media/${file_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'Media-Type': 'video,audio,photo,document',
            'Skip-Status': '--NONE--',
            'Folder-ID': folder_id,
            'Direction': direction,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else if (data.results.length > 0) {
            const file_obj = data.results[0];
            const next_file_id = file_obj.file_id;
            const next_file_name = file_obj.file_name;
            const next_media_type = file_obj.media_type;
            const next_url = file_obj.file_url;

            modalOverlay.setAttribute('file_id', next_file_id);
            document.getElementById('viewer-title').textContent = next_file_name;

            const mediaContainer = document.getElementById('media-container');
            const media_type = mediaContainer.getAttribute('media_type');

            const placeHolders = document.getElementsByClassName('viewer-asset-holder');
            Array.from(placeHolders).forEach(placeHolder => {
                if (placeHolder.id != ('viewer-asset-' + next_media_type)) {
                    placeHolder.style.display = 'none';
                    placeHolder.style.visibility = 'hidden';
                    placeHolder.src = '';
                }
            });

            const assetViewer = document.getElementById('viewer-asset-'+next_media_type);
            assetViewer.src = next_url;
            assetViewer.style.display = 'block';
            assetViewer.style.visibility = 'visible';
            mediaContainer.setAttribute('media_type', next_media_type);

            // Force reflow to display audio element
            void assetViewer.offsetHeight;

            if (next_media_type == 'video' || next_media_type == 'audio') {
                assetViewer.load();
                setTimeout(() => {
                    assetViewer.controls = true;
                    void assetViewer.offsetHeight;
                });
            }

            const container = document.getElementById('asset-details');
            document.getElementById('asset-details-basic').remove();
            document.getElementById('asset-details-iso').remove();
            document.getElementById('asset-details-extras').remove();
            document.getElementById('asset-details-audit-div').remove();
            document.getElementById('asset-details-transcript-div').remove();

            const tabAudit = document.getElementById('asset-tab-audit');
            tabAudit.setAttribute('initialized', 'false');

            const tabTranscript = document.getElementById('asset-tab-transcript');
            tabTranscript.setAttribute('initialized', 'false');

            const tabs = document.getElementById('asset-tabs');
            const activeTab = tabs.getAttribute('activeTab');
            tabs.setAttribute('file_id', next_file_id);
            showAssetDetails(container, data.results[0], activeTab);

            const filePosition = document.getElementById('viewer-file-position');
            getFilePosition(filePosition,next_file_id, currentFolderID);
        }
    })
    .catch(error => {
        console.log(error);
    });
}

function displayFirstAsset(modalOverlay) {
    displayAdjacentAsset(modalOverlay, 0, currentFolderID, 'forward');
}

function displayPreviousAsset(modalOverlay) {
    const file_id = modalOverlay.getAttribute('file_id');
    displayAdjacentAsset(modalOverlay, file_id, currentFolderID, 'backward');
}

function displayNextAsset(modalOverlay) {
    const file_id = modalOverlay.getAttribute('file_id');
    displayAdjacentAsset(modalOverlay, file_id, currentFolderID, 'forward');
}

function displayLastAsset(modalOverlay) {
    displayAdjacentAsset(modalOverlay, INT_MAX, currentFolderID, 'backward');
}

function displayNavInfo(filePosition, fileCount, file_id) {
    getFilePosition(filePosition, file_id, currentFolderID);
    getFileCount(fileCount, currentFolderID);
    filePosition.style.display = 'inline-block';
    fileCount.style.display = 'inline-block';
}

function getFilePosition(filePosition, file_id, folder_id) {
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
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Unknown error occurred.');
            });
        }
        return response.json();
    })
    .then(data => {
        filePosition.textContent = '(' + data.result + ' of';
    })
    .catch(error => {
        console.log(error);
    });
}

function getFileCount(fileCount, folder_id) {
    const csrftoken = getCookie('csrftoken');
    fetch(`/api/get-file-count/${folder_id}/`, {
        method: 'GET',
        headers: {
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Unknown error occurred.');
            });
        }
        return response.json();
    })
    .then(data => {
        totalFiles = data.result;
        fileCount.textContent = data.result + ' files)';
    })
    .catch(error => {
        console.log(error);
    });
}

function showEditor(editable) {
    // Check if user can edit this record
    const tabs = document.getElementById('asset-tabs');
    const file_id = tabs.getAttribute('file_id');

    // TO DO: Optional: Check backend

    if (editorDiv == null)
        editorDiv = document.getElementById('editor-div');

    if (editorText == null)
        editorText = document.getElementById('editor-textarea');

    if (editorDiv.classList.contains('editor-visible'))
        cancelEdits();

    editorDiv.classList.remove('editor-hidden');
    editorDiv.classList.add('editor-visible');

    const rect = editable.getBoundingClientRect();
    editorDiv.style.width = (rect.width) + 'px';
    editorDiv.style.height = (rect.height+8) + 'px'; // Space for margins
    editorText.style.width = (rect.width-48) + 'px'; // Space for the buttons

    // Store the value of the editable into an attribute
    parentKey = editable.getAttribute('parent-key');
    key = editable.getAttribute('key');
    editorText.value = editable.textContent;
    editorText.setAttribute('file_id', file_id);
    editorText.setAttribute('original-id', editable.id);
    editorText.setAttribute('original-parent-key', parentKey);
    editorText.setAttribute('original-key', key);
    editorText.setAttribute('original-value', editable.textContent);
    editable.textContent = '';

    // Remove the editorDiv from its current parent, then append to a new parent
    editorDiv.remove();
    editable.appendChild(editorDiv);

    // Hide/show the textarea
    editorText.style.display = 'inline';
    editorText.focus();
}

function saveEdits() {
    // Check if there is something to save
    if (editorText.getAttribute('original-value') == editorText.value) {
        console.log('Nothing to save.');
        cancelEdits();
        return;
    }

    const file_id = editorText.getAttribute('file_id');
    const parentKey = editorText.getAttribute('original-parent-key');
    const key = editorText.getAttribute('original-key');
    const value = editorText.value;
    updateFile(file_id, parentKey, key, value);
}

function updateFile(file_id, parentKey, key, value) {
    // Store data to database
    let pair = {};

    if (parentKey != '') {
        const tableExtradata =  document.getElementById('asset-details-extra_data');
        const edStr = tableExtradata.getAttribute('extra_data');
        const edJson = JSON.parse(edStr);
        edJson[key] = value;
        pair[parentKey] = edJson;
    } else {
        pair[key] = value;
    }

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/update-file/${file_id}/`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify(pair)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Unknown error occurred.');
            });
        }
        return response.json();
    })
    .then(data => {
        editorDiv.classList.remove('editor-visible');
        editorDiv.classList.add('editor-hidden');
        const editable = document.getElementById(editorText.getAttribute('original-id'));
        editable.textContent = value;
    })
    .catch(error => {
        alert(error.message);
    });
}

function cancelEdits() {
    const editable = document.getElementById(editorText.getAttribute('original-id'));

    editorDiv.classList.remove('editor-visible');
    editorDiv.classList.add('editor-hidden');

    editable.textContent = editorText.getAttribute('original-value');
}

function submitKeyValue() {
    const form = document.getElementById('key-value-form');
    const key = form.elements.key.value;
    const value = form.elements.value.value;

    const message = document.getElementById('dialog-message');
    if (!isAlphaNumeric(key)) {
        message.textContent = 'A key must be alphanumeric.';
    } else {
        const dialog = document.getElementById('key-value-dialog');
        dialog.close();
    }
}

function updateExtraData(key, value) {
    let pair = {};

    const tabs = document.getElementById('asset-tabs');
    const file_id = tabs.getAttribute('file_id');
    const tableExtradata =  document.getElementById('asset-details-extra_data');
    const edStr = tableExtradata.getAttribute('extra_data');
    const edJson = JSON.parse(edStr);
    edJson[key] = value;
    pair['extra_data'] = edJson;

    const csrftoken = getCookie('csrftoken');
    fetch(`/api/update-file/${file_id}/`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Subscription-ID': SUBSCRIPTION_ID,
            'Client-Secret': CLIENT_SECRET,
            'X-CSRFToken': csrftoken,
        },
        body: JSON.stringify(pair)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Unknown error occurred.');
            });
        }
        return response.json();
    })
    .then(data => {
        addPairToTable(key, value);
    })
    .catch(error => {
        alert(error.message);
    });
}

function addPairToTable(key, value) {
    const table = document.getElementById('asset-details-extra_data');
    const row = document.createElement("tr");
 
    const parentKey = 'extra_data';
    const keyCell = document.createElement("td");
    keyCell.textContent = toTitleCase(key.replace('_',' '));
    keyCell.className = 'asset-details-key';
    keyCell.classList.add('editable-key');

    const valueCell = document.createElement("td");
    valueCell.id = 'value-cell-' + key;
    valueCell.textContent = value;
    valueCell.className = 'asset-details-value';
    valueCell.classList.add('editable-value');
    valueCell.setAttribute('key',key);
    valueCell.setAttribute('parent-key',parentKey);
    valueCell.addEventListener('dblclick', () => showEditor(valueCell));

    const cbCell = document.createElement("td");
    const checkBox = document.createElement('input');
    checkBox.id = 'asset-detail-' + parentKey + '-' + key;
    checkBox.type = 'checkbox';
    cbCell.appendChild(checkBox);
    cbCell.className = 'asset-details-checkbox';

    row.appendChild(cbCell);
    row.appendChild(keyCell);
    row.appendChild(valueCell);
    table.appendChild(row);
}

function addKeyValuePair() {
    document.getElementById('key-value-dialog').showModal();
    document.getElementById('keyInput').focus();
}

function removeKeyValuePair() {
    console.log('Remove selected pairs.');
}
