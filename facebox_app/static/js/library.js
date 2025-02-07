const SUBSCRIPTION_ID = "00000000";
const CLIENT_SECRET = "00000000";
const FOLDER_ICON = "\u{1F4C1}";
const COLUMN_FILTER_ICON = "\u{25A5}";
const FOLDER_WIDTH = 20;

let currentPage = 1;
let totalPages = 1;
let recordSet = null;
let currentFolder = "/";
let maxRows = 25;

$.fn.dataTable.ext.errMode = 'none';

document.addEventListener("DOMContentLoaded", function () {

  const searchButton = document.getElementById("search-button");
  searchButton.addEventListener("click", performSearch);

  const resetButton = document.getElementById("reset-button");
  resetButton.addEventListener("click", resetPage);

  const renameButton = document.getElementById("btn-rename");
  renameButton.addEventListener("click", () => renameFile());

  const moveButton = document.getElementById("btn-move");
  moveButton.addEventListener("click", () => moveFile());

  const setOwnerButton = document.getElementById("btn-set-owner");
  setOwnerButton.addEventListener("click", () => setFileOwner());

  const setGroupButton = document.getElementById("btn-set-group");
  setGroupButton.addEventListener("click", () => setFileGroup());

  const setAccessButton = document.getElementById("btn-set-access");
  setAccessButton.addEventListener("click", () => setFileAccess());

  const topPageButton = document.getElementById("top-page");
  topPageButton.addEventListener("click", () => goToPage("top"));

  const prevPageButton = document.getElementById("prev-page");
  prevPageButton.addEventListener("click", () => goToPage("prev"));

  const nextPageButton = document.getElementById("next-page");
  nextPageButton.addEventListener("click", () => goToPage("next"));

  const bottomTopPageButton = document.getElementById("bottom-top-page");
  bottomTopPageButton.addEventListener("click", () => goToPage("top"));

  const bottomPrevPageButton = document.getElementById("bottom-prev-page");
  bottomPrevPageButton.addEventListener("click", () => goToPage("prev"));

  const bottomNextPageButton = document.getElementById("bottom-next-page");
  bottomNextPageButton.addEventListener("click", () => goToPage("next"));

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
    const query = 'input[type="checkbox"][id^="checkbox_"]';
    Array.from(document.querySelectorAll(query)).forEach(checkbox => {
      checkbox.checked = selectAll.checked;
    });
    e.stopPropagation();
  });

  setMaxRows(maxRows);
  getGroups();

  // Initial load
  getFolders(1,'folder-list',false,false);
  browseFolder();
});

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
    searchVideos(value, currentFolder);
  } else if (isUnquoted(value) && containsSpace(value)) {
    // make the search string a valid TsQuery. Assume OR.
    value = trimWhitespaces(value).replaceAll(" ", " | ");
    searchVideos(value, currentFolder);
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
  searchVideos("", currentFolder);
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
          targets: [6, 8, 9, 14, 16, 17, 18],
          visible: false,
        },
        {
          targets: [2, 13, 15, 16, 17],
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
  // Select the td elements with class 'paging-buttons'
  const topPagingButtons = document.querySelector('.controls table tr td.paging-buttons');
  
  if (!topPagingButtons) {
    console.error('Could not find paging buttons containers');
    return;
  }

  // Create buttons for top and bottom controls
  const topButton = createColumnButton();
  
  // Insert buttons before the toggle view button in top controls
  const toggleBtn = document.querySelector('#toggleViewBtn');
  if (toggleBtn && toggleBtn.parentElement) {
    toggleBtn.parentElement.parentElement.insertBefore(topButton, toggleBtn.parentElement);
  } else {
    topPagingButtons.insertBefore(topButton, topPagingButtons.firstChild);
  }
  
  // Initialize the column visibility functionality
  initializeColumnVisibility();
}

function createColumnButton() {
  let button = document.getElementById('column-filter-button');
  if (button == null) {
      button = document.createElement('button');
      button.id = 'column-filter-button';
      button.className = 'filter-button column-visibility-btn';
      button.textContent = COLUMN_FILTER_ICON;
  }
  return button;
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
        updatePagination(data.results);
        displayThumbnails(data.results);
      }
    })
    .catch((error) => {
      console.log(error);
      displayError("An error occurred while fetching data.");
    });
}

function searchVideos(pattern = "", scope = "/") {
  const csrftoken = getCookie("csrftoken");
  const offset = (currentPage - 1) * maxRows;
  table = $("#results-table").DataTable();
  table.destroy();
  fetch("/api/search-video/", {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Max-Rows": maxRows,
      "Start-From": offset,
      Pattern: pattern,
      Scope: scope,
      "Media-Type": "video",
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
        highlightWords(dequote(pattern));
        updatePagination(data.results);
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
    console.error("Data is empty or invalid:", data);
    resultsBodyTiles.innerHTML = "No Records Found";
    return;
  }

  let html = "";

  data.forEach((item) => {
    attributes = JSON.parse(item.attributes);
    videoLength = Math.abs(attributes["length"]);
    const formattedTime = timeToStr(videoLength);
    attributes.length = formattedTime;
    attributes_new = JSON.stringify(attributes)
        .replaceAll("\\", "")
        .replaceAll('"', "")
        .replaceAll(",", ", ");
    html += `
      <div class="tile">
        <table class="tile_table">
          <tr class="title-field" data-file-id-tile="${item.file_id}" >
            <td>
              <table>
                <tr>
                  <td>
                    <img class="thumbnail" id="thumbnail_tiles${
                      item.file_id
                    }" src="" alt="thumbnail"    
                     data-video-url="${item.file_url}" >
                  </td>
                </tr>
                <tr>
                  <td>
                    <div class="field_label">File Size</div>
                    <div class="field_value">${(
                      item.size /
                      1024 /
                      1024
                    ).toFixed(2)} MB</div>
                  </td>
                </tr>
              </table>
            </td>
            <td>
              <table class="table_fields">
                <tr>
                  <td>
                    <div class="field_label">Title</div>
                    <div class="field_value"   data-title="${
                      item.title
                    }" data-file-id-tile="${item.file_id}" >${item.title}</div>
                  </td>
                  
                </tr>
                <tr>
                  <td>
                    <div class="field_label">Filename</div>
                    <div class="field_value">
                      <a href="${
                        item.file_url
                      }" class="hyperlink" target="_blank">
                        ${item.file_name}
                      </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div class="field_label">Description</div>
                    <div class="field_value">${item.description}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div class="field_label">Attributes</div>
                    <div class="field_value">
                      Length: ${attributes.length}<br />
                      Frame Rate: ${attributes.frame_rate} FPS<br />
                      Audio Channels: ${attributes.audio_channels}<br />
                      Resolution: ${attributes.video_resolution}<br />
                      Sample Rate: ${attributes.audio_sample_rate} Hz
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  });

  if (append) {
    resultsBodyTiles.innerHTML += html;
  } else {
    resultsBodyTiles.innerHTML = html;
  }
  const thumbnails = document.querySelectorAll(".thumbnail");
  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => {
      const videoUrl = thumbnail.getAttribute("data-video-url");
      const startTime = thumbnail.getAttribute("data-start-time");

      // Open popup and play video
      openVideoPopup(videoUrl, startTime);
    });
  });
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
  displayThumbnailsTiles(data);
}

function displayResults(results) {
  table = $("#results-table").DataTable();
  table.destroy();
  applyFilters();
  const resultsBody = document.getElementById("results-body");
  resultsBody.innerHTML = "";

  displayResultsTiles(results);
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
    const row = document.createElement("tr");
    row.id = "row_" + item.file_id;
    row.addEventListener("dblclick", function (event) {
      window.open(
        "/app/media-player/?file_id=" + item.file_id + "&file_name=video",
        "_blank"
      );
    });

    let html = `
        <td><div class='select-cell'><input type='checkbox' id='checkbox_${item.file_id}'
            data-file-id='${item.file_id}'
            data-file-name='${item.file_name}'>
            <label for='checkbox_${item.file_id}'>${item.file_id}</label></td>
        <td><img class="thumbnail thumbnail_tab" id="thumbnail_${
            item.file_id
        }" src=""  data-video-url="${item.file_url}" alt="thumbnail"></td>
        <td id="file_name_${item.file_id}"><a href="${item.file_url}" 
            class="hyperlink" target="_blank">${item.file_name}</a></td>
        <td>${item.extension.toUpperCase().replaceAll(".", "")}</td>
        <td>${item.media_source}</td>
        <td>${formatSize(item.size)}</td>
        <td>${formatDate(item.date_created)}</td>
        <td>${formatDate(item.date_uploaded)}</td>
        <td>${formatDate(item.last_accessed)}</td>
        <td>${formatDate(item.last_modified)}</td>
        <td id='owner_name_${item.file_id}'>${coalesce(item.owner_name)}</td>
        <td id='group_name_${item.file_id}'>${coalesce(item.group_name)}</td>
        <td id='access_rights_${item.file_id}'>${accessRightsToStr(item.owner_rights,item.group_rights,item.domain_rights,item.public_rights)}</td>
        <td>${coalesce(item.remarks)}</td>
        <td>${item.version}</td>
        <td>${sanitizeJson(item.attributes)}</td>
        <td>${sanitizeJson(item.extra_data)}</td>
        <td>${item.ip_location}</td>
        <td>${item.file_status}</td>`;
    row.innerHTML = html;
    resultsBody.appendChild(row);
  });
  const thumbnails = document.querySelectorAll(".thumbnail_tab");
  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => {
      const videoUrl = thumbnail.getAttribute("data-video-url");
      const startTime = thumbnail.getAttribute("data-start-time");

      // Open popup and play video
      openVideoPopup(videoUrl, startTime);
    });
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

function displayThumbnailsTiles(results) {
  const csrftoken = getCookie("csrftoken");
  results.forEach((item) => {
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
            const imageObj = document.getElementById(
              "thumbnail_tiles" + item.file_id
            );
            imageObj.src = imageUrl;
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

function displayThumbnails(results) {
  const csrftoken = getCookie("csrftoken");
  results.forEach((item) => {
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
            const imageObj = document.getElementById(
              "thumbnail_" + item.file_id
            );
            imageObj.src = imageUrl;
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

function updatePagination(results) {
  if (results == null) return;

  const prevPageButton = document.getElementById("prev-page");
  const nextPageButton = document.getElementById("next-page");
  const bottomPrevPageButton = document.getElementById("bottom-prev-page");
  const bottomNextPageButton = document.getElementById("bottom-next-page");

  prevPageButton.disabled = currentPage === 1;
  bottomPrevPageButton.disabled = currentPage === 1;

  nextPageButton.disabled = results.length < maxRows;
  bottomNextPageButton.disabled = results.length < maxRows;
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
  searchVideos(document.getElementById("search-box").value, currentFolder);
}

function displayError(message) {
  const resultsBody = document.getElementById("results-body");
  resultsBody.innerHTML = `<tr><td colspan="20">${message}</td></tr>`;
}

function getFolders(parent_id = 1, target='folder-browser', is_popup=true, reposition=true) {
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
    col.appendChild(icon);
    col.appendChild(label);
    icon.innerHTML = FOLDER_ICON;
    icon.style.paddingLeft = folder.folder_level * FOLDER_WIDTH + "px";
    icon.setAttribute("folder_id", folder.folder_id);
    icon.classList.add("folder-icon");
    label.innerHTML = folder.name;
    label.setAttribute("folder_id", folder.folder_id);
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
      });
    });

    // Handle folder click to select the folder
    label.addEventListener("click", function (event) {
      folder["path_name"] = folder.path + folder.name;
      selectFolder(folder);
    });

    return row;
  }

  function createRootFolder() {
    const table = document.createElement("table");
    const row = document.createElement("tr");
    const col = document.createElement("td");
    const icon = document.createElement("span");
    const label = document.createElement("span");
    row.appendChild(col);
    col.appendChild(icon);
    col.appendChild(label);
    table.appendChild(row);
    table.id = "folder-tree";
    icon.style.paddingLeft = "0px";
    icon.innerHTML = FOLDER_ICON;
    icon.setAttribute("folder_id", 1);
    icon.classList.add("folder-icon");
    label.innerHTML = "[all folders]";
    label.setAttribute("folder_id", 1);
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
    })
    .catch((error) => {
      console.log(error);
      alert("An error occurred while fetching folders.");
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
  updatePlaceholder();
  performSearch();
  applyFilters();
}

function setMaxRows(value) {
  maxRows = value;
  const maxRowsUL = document.getElementById("max-rows-options");
  const maxRowsLIs = maxRowsUL.querySelectorAll("li");
  maxRowsLIs.forEach((li) => {
    if (li.id == "li-" + maxRows.toString()) {
      li.style.listStyleType = "disc";
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

function createModalOverlay(title, ok_label, files, selection='dropdown') {
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
    closeButton.className = 'btn btn-primary';
    closeButton.textContent = 'X';
 
    // Modal body
    const body = document.createElement('div');
    body.className = 'modal-body';
    
    // File list
    const fileList = document.createElement('div');
    fileList.className = 'file-list';
    files.forEach(([id,fileName]) => {
        const fileElement = document.createElement('div');
        fileElement.className = 'file-list-item';
        fileElement.textContent = fileName;
        fileElement.id = `file-list-item-${id}`;
        fileList.appendChild(fileElement);
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
    footer.textContent = `${files.length} files selected.`;
    footer.id = 'modal-footer';
    
    const okButton = document.createElement('button');
    okButton.className = 'btn btn-primary';
    okButton.textContent = ok_label;
    okButton.id = 'modal-ok-button';
 
    // Subfooter for error messages
    const statusbar = document.createElement('div');
    statusbar.className = 'modal-body';
    statusbar.id = 'modal-statusbar';

    // Assemble modal
    header.appendChild(closeButton);
    body.appendChild(fileList);
    body.appendChild(userSelect);
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
    
    return modalOverlay;
}

function renameFile() {
    const query = 'input[type="checkbox"]:checked[id^="checkbox_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes) {
        alert("No selected file!");
        return;
    }

    const files = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-file-id'),
        cb.getAttribute('data-file-name')
    ]).sort((a, b) => a[1] < b[1]);

    const selectedFile = files[0];
    const newName = prompt(`Enter a new file name for ${selectedFile[1]}`,selectedFile[1]);

    if (!newName) {
        return;
    }

    const csrftoken = getCookie("csrftoken");
    fetch(`/api/rename-file/${selectedFile[0]}/`, {
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
            const tdElement = document.getElementById(`file_name_${selectedFile[0]}`);
            tdElement.innerHTML = tdElement.innerHTML.replace(selectedFile[1],newName);
        }
    })
    .catch(error => {
        alert('Unable to rename file. Please try again.');
    });
}

function moveFile() {
    const query = 'input[type="checkbox"]:checked[id^="checkbox_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected file!");
        return;
    }

    const files = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-file-id'),
        cb.getAttribute('data-file-name')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Move File(s)','Move', files, 'textbox');
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
        const moveFiles = async (files, folder_id) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const promises = files.map(([id, fileName]) => {        
                return fetch(`/api/move-file/${id}/${folder_id}/`, {
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
                    const fileListItem = document.getElementById(`file-list-item-${id}`);
                    if (data.error) {
                        results.failed++;
                        results.errors.push({ id: id, fileName: fileName, error: data.error });
                        fileListItem.innerHTML += '&nbsp;&times;';
                    } else {
                        results.successful++;
                        fileListItem.innerHTML += '&nbsp;&check;';
                        /* TO DO: delete the table row. */
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
                moveFiles(files, folder_id)
                    .then(results => {
                        footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                        if (results.errors.length > 0) {
                            results.errors.map(({id, fileName, error}) => {
                                const errMsg = document.createElement('div');
                                errMsg.className = 'error-msg-item';
                                errMsg.textContent = `${id}:${fileName}: ${error}`;
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

function setFileOwner() {
    const query = 'input[type="checkbox"]:checked[id^="checkbox_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected file!");
        return;
    }

    const files = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-file-id'),
        cb.getAttribute('data-file-name')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Set File Owner','Set Owner', files);
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

        const updateOwners = async (files, selectedUser) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const promises = files.map(([id, fileName]) => {        
                return fetch(`/api/set-file-owner/${id}/${selectedUser}/`, {
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
                    const fileListItem = document.getElementById(`file-list-item-${id}`);
                    if (data.error) {
                        results.failed++;
                        results.errors.push({ id: id, fileName: fileName, error: data.error });
                        fileListItem.innerHTML += '&nbsp;&times;';
                    } else {
                        results.successful++;
                        fileListItem.innerHTML += '&nbsp;&check;';
                        const ownerNameItem = document.getElementById(`owner_name_${id}`);
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
        updateOwners(files, selectedUser)
            .then(results => {
                footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                if (results.errors.length > 0) {
                    results.errors.map(({id, fileName, error}) => {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'error-msg-item';
                        errMsg.textContent = `${id}:${fileName}: ${error}`;
                        document.getElementById('modal-statusbar').appendChild(errMsg);
                    });
                }
            });
    };
}

function setFileGroup() {
    const query = 'input[type="checkbox"]:checked[id^="checkbox_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected file!");
        return;
    }

    const files = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-file-id'),
        cb.getAttribute('data-file-name')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Set File Group','Set Group', files);
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

        const updateGroups = async (files, selectedGroup) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const promises = files.map(([id, fileName]) => {        
                return fetch(`/api/set-file-group/${id}/${selectedGroup}/`, {
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
                    const fileListItem = document.getElementById(`file-list-item-${id}`);
                    if (data.error) {
                        results.failed++;
                        results.errors.push({ id: id, fileName: fileName, error: data.error });
                        fileListItem.innerHTML += '&nbsp;&times;';
                    } else {
                        results.successful++;
                        fileListItem.innerHTML += '&nbsp;&check;';
                        const groupNameItem = document.getElementById(`group_name_${id}`);
                        groupNameItem.innerHTML = selectedGroup;
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
        updateGroups(files, selectedGroup)
            .then(results => {
                footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                if (results.errors.length > 0) {
                    results.errors.map(({id, fileName, error}) => {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'error-msg-item';
                        errMsg.textContent = `${id}:${fileName}: ${error}`;
                        document.getElementById('modal-statusbar').appendChild(errMsg);
                    });
                }
            });
    };
}

function setFileAccess() {
    let query = 'input[type="checkbox"]:checked[id^="checkbox_"]';
    const checkedBoxes = document.querySelectorAll(query);
    if (!checkedBoxes.length) {
        alert("No selected file!");
        return;
    }

    const files = Array.from(checkedBoxes).map(cb => [
        cb.getAttribute('data-file-id'),
        cb.getAttribute('data-file-name')
    ]).sort((a, b) => a[1] < b[1]);

    const modalOverlay = createModalOverlay('Set File Access','Set Access', files, 'checkboxes');
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

        const updateAccess = async (files, o_r, g_r, d_r, p_r) => {
            const results = {
                successful: 0,
                failed: 0,
                errors: []
            };

            const csrftoken = getCookie("csrftoken");
            const promises = files.map(([id, fileName]) => {        
                return fetch(`/api/set-file-permission/${id}/${o_r}/${g_r}/${d_r}/${p_r}/`, {
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
                    const fileListItem = document.getElementById(`file-list-item-${id}`);
                    if (data.error) {
                        results.failed++;
                        results.errors.push({ id: id, fileName: fileName, error: data.error });
                        fileListItem.innerHTML += '&nbsp;&times;';
                    } else {
                        results.successful++;
                        fileListItem.innerHTML += '&nbsp;&check;';
                        const accessRightsItem = document.getElementById(`access_rights_${id}`);
                        accessRightsItem.innerHTML = accessRightsToStr(o_r,g_r,d_r,p_r);
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
        updateAccess(files, ownerRights, groupRights, domainRights, publicRights)
            .then(results => {
                footer.textContent = `${results.successful} successfully updated, ${results.failed} failed.`;
                if (results.errors.length > 0) {
                    results.errors.map(({id, fileName, error}) => {
                        const errMsg = document.createElement('div');
                        errMsg.className = 'error-msg-item';
                        errMsg.textContent = `${id}:${fileName}: ${error}`;
                        document.getElementById('modal-statusbar').appendChild(errMsg);
                    });
                }
            });
    };
}
