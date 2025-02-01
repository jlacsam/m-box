const SUBSCRIPTION_ID = "00000000";
const CLIENT_SECRET = "00000000";
const FOLDER_ICON = "\u{1F4C1}";
const COLUMN_FILTER_ICON = "\u{25A5}";
const FOLDER_WIDTH = 20;
const DEFAULT_HIDDEN_COLUMNS = [4,5,6,7,8,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];

let currentPage = 1;
let totalPages = 1;
let recordSet = null;
let currentFolder = "/";
let maxRows = 25;
let hiddenColumns = new Set(DEFAULT_HIDDEN_COLUMNS);

$.fn.dataTable.ext.errMode = 'none';

document.addEventListener("DOMContentLoaded", function () {
  const searchBox = document.getElementById("search-box");
  const searchButton = document.getElementById("search-button");
  const resetButton = document.getElementById("reset-button");
  const topPageButton = document.getElementById("top-page");
  const prevPageButton = document.getElementById("prev-page");
  const nextPageButton = document.getElementById("next-page");
  const bottomTopPageButton = document.getElementById("bottom-top-page");
  const bottomPrevPageButton = document.getElementById("bottom-prev-page");
  const bottomNextPageButton = document.getElementById("bottom-next-page");
  const photosTab = document.getElementById("photos-tab");
  const folderBrowser = document.getElementById("folder-browser");

  searchButton.addEventListener("click", performSearch);
  resetButton.addEventListener("click", resetPage);
  topPageButton.addEventListener("click", () => goToPage("top"));
  prevPageButton.addEventListener("click", () => goToPage("prev"));
  nextPageButton.addEventListener("click", () => goToPage("next"));
  bottomTopPageButton.addEventListener("click", () => goToPage("top"));
  bottomPrevPageButton.addEventListener("click", () => goToPage("prev"));
  bottomNextPageButton.addEventListener("click", () => goToPage("next"));

  searchBox.addEventListener("keyup", function (event) {
    if (event.key === "Enter") {
      performSearch();
    } else if (searchBox.value.length > 1) {
      if (isSemantic(searchBox.value) > 0) {
        searchBox.classList.remove('invalid-search');
        searchBox.classList.add('semantic-search');
      } else if (isProperlyQuotedOrUnquoted(searchBox.value)) {
        searchBox.classList.remove('invalid-search');
        searchBox.classList.remove('semantic-search');
      } else {
        searchBox.classList.add('invalid-search');
      }
    } else {
      searchBox.classList.remove('invalid-search');
      searchBox.classList.remove('semantic-search');
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

  folderBrowser.addEventListener("mouseleave", function (Event) {
    if (folderBrowser.classList.contains("folder-browser-visible")) {
      folderBrowser.classList.remove("folder-browser-visible");
      folderBrowser.classList.add("folder-browser-hidden");
    }
  });

  // Get initial folder
  savedFolder = getCookie('VideoBox.currentFolder');
  if (savedFolder != null) currentFolder = savedFolder;
  const breadCrumbs = document.getElementById("bread-crumbs");
  breadCrumbs.innerHTML = currentFolder == '/' ? '[all folders]' : currentFolder;
  updatePlaceholder();

  // Get initial hidden columns
  savedHiddenColumns = getCookie('VideoBox.hiddenColumns');
  if (savedHiddenColumns) hiddenColumns = new Set(JSON.parse(savedHiddenColumns));

  // Get initial max rows
  savedMaxRows = getCookie('VideoBox.maxRows');
  if (savedMaxRows) maxRows = parseInt(savedMaxRows);
  setMaxRows(maxRows);

  photosTab.style.color = "#ffffff";

  getGroups();

  // Initial load
  performSearch();
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

function performSearch(resetCurrentPage=true) {
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

  if (resetCurrentPage) {
    currentPage = 1;
  }

  if (isSemantic(value) > 0) {
    doSemanticSearch(value, currentFolder);
  } else {
    if (value.length == 0 || isValidTsQueryString(value)) {
      searchPhotos(value, currentFolder);
    } else if (isUnquoted(value) && containsSpace(value)) {
      // make the search string a valid TsQuery. Assume OR.
      value = trimWhitespaces(value).replaceAll(" ", " | ");
      searchPhotos(value, currentFolder);
    } else {
      alert("Invalid search string.");
    }
  }
}

function updatePlaceholder() {
  const searchBox = document.getElementById("search-box");
  if (currentFolder == "/") {
    searchBox.placeholder = "[Search photos in all folders]";
  } else {
    searchBox.placeholder = `[Search photos in ${currentFolder}]`;
  }
}

function resetPage() {
  const searchBox = document.getElementById("search-box");
  searchBox.value = "";
  updatePlaceholder();
  currentPage = 1;
  searchPhotos("", currentFolder);
}

function applyFilters() {
    $(document).ready(() => {
        // Common DataTable configuration
        const config = {
            paging: false,
            searching: false,
            ordering: true,
            info: false,
            order: [[0, "asc"]],
            dom: "Bfrtip",
            columnDefs: [
                {
                    targets: Array.from(hiddenColumns).sort((a, b) => a - b),
                    visible: false
                },
                {
                    targets: [1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],
                    orderable: false
                }
            ]
        };

        // Destroy existing table if it exists
        if ($.fn.dataTable.isDataTable("#results-table")) {
            $("#results-table").DataTable().destroy();
        }

        // Initialize table with config
        $("#results-table").DataTable(config);

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
          if (this.checked) {
             if (hiddenColumns.has(colIdx)) 
                 hiddenColumns.delete(colIdx);
          } else {
             if (!hiddenColumns.has(colIdx)) 
                 hiddenColumns.add(colIdx);
          }
          setCookie('VideoBox.hiddenColumns',JSON.stringify(Array.from(hiddenColumns)));
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

function searchPhotos(pattern = "", scope = "/") {
  const csrftoken = getCookie("csrftoken");
  const offset = (currentPage - 1) * maxRows;
  // table = $("#results-table").DataTable();
  // table.destroy();
  const resultsBodyTiles = document.getElementById("results-body");
  resultsBodyTiles.innerHTML = null;
  fetch("/api/search-photo/", {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Max-Rows": maxRows,
      "Start-From": offset,
      Pattern: pattern,
      Scope: scope,
      "Media-Type": "photo",
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
        applyFilters();
        if (data.results.length == 0) {
          const resultsBodyTiles = document.getElementById("bottom-results-label");
          resultsBodyTiles.innerHTML = "No Records Found";
        } else {
          const resultsBodyTiles = document.getElementById("bottom-results-label");
          resultsBodyTiles.innerHTML = `Showing ${offset + 1} to ${offset + recordSet.length} Records`;
        }
      }
    })
    .catch((error) => {
      console.log(error);
      displayError("An error occurred while fetching data.");
    });
}

function doSemanticSearch(text, scope = "/") {
  const csrftoken = getCookie("csrftoken");
  const offset = (currentPage - 1) * maxRows;

  table = $("#results-table").DataTable();
  table.destroy();

  let pair = {};
  pair['text'] = text;

  fetch("/api/search-transcript/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Media-Type": "video",
      "Scope": scope,
      "Max-Rows": maxRows,
      "Start-From": offset,
    },
    body: JSON.stringify(pair)
  })
  .then((response) => response.json())
  .then((data) => {
    if (data.error) {
      displayError(data.error);
    } else {
      document.getElementById("desc-header").innerHTML = "Excerpt";
      recordSet = data.results;
      displayResults(data.results);
      updatePagination(data.results);
      displayThumbnails(data.results,true);
      if (data.results.length == 0) {
        const resultsBodyTiles = document.getElementById("bottom-results-label");
        resultsBodyTiles.innerHTML = "No Records Found";
      } else {
        const resultsBodyTiles = document.getElementById("bottom-results-label");
        resultsBodyTiles.innerHTML = `Showing ${offset + 1} to ${offset + recordSet.length} Records`;
      }
    }
  })
  .catch((error) => {
    console.log(error);
    displayError("An error occurred while fetching data.");
  });
}

function displayResultsTiles(data, append = false) {
  const resultsBodyTiles = document.getElementById("tiles-results-photo");
  resultsBodyTiles.innerHTML = ""
  if (!resultsBodyTiles) {
    console.error("Element with ID 'tiles-results-photo' not found");
    resultsBodyTiles.innerHTML = "No Records Found";
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    resultsBodyTiles.innerHTML = "No Records Found";
    return;
  }

  let html = "";

  data.forEach((item) => {
    let tags = item.tags ? customTrim(item.tags, "[]") : "";
    let texts = item.texts ? customTrim(item.texts, "[]") : "";

    html += `
        <div class="tile">
          <table class="tile_table">
            <tr class="title-field" data-file-id-tile="${item.file_id}">
              <td>
                <table>
                  <tr>
                    <td>
                      <img class="thumbnail thumbnail-tile-photo" id="thumbnail_tiles${
                        item.file_id
                      }" 
                           src="${item.file_url}" alt="thumbnail"
                           data-image-url-photo="${item.file_url}">
                    </td>
                  </tr>
                 
                </table>
              </td>
              <td>
                <table class="table_fields px-3">
                  <tr>
                    <td>
                      <div class="field_label">Title</div>
                      <div class="field_value">${item.title || "None"}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div class="field_label">Description</div>
                      <div class="field_value">${
                        item.description || "N/A"
                      }</div>
                    </td>
                  </tr>
                   <tr>
                    <td>
                      <div class="field_label">Tags</div>
                      <div class="field_value ellipsis" title="${texts}">${tags || "N/A"}</div>
                    </td>
                  </tr>
                    <tr>
                    <td>
                      <div class="field_label">Texts</div>
                      <div class="field_value ellipsis" title="${texts}">${texts || "N/A"}</div>
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

  //   console.log("Tiles HTML rendered successfully");

  // Event listeners for double-click
  const titles = document.querySelectorAll(".title-field");
  titles.forEach((title) => {
    title.addEventListener("dblclick", () => {
      const fileId = title.getAttribute("data-file-id-tile");
      console.log("Double-clicked file ID:", fileId); // Debugging
      if (fileId) {
        window.open(
          `/app/photo-viewer/?file_id=${fileId}&file_name=photo`,
          "_blank"
        );
      } else {
        console.error("file_id is null or undefined.");
      }
    });
  });

  const thumbnails = document.querySelectorAll(".thumbnail-tile-photo");
  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => {
      const imageUrl = thumbnail.getAttribute("data-image-url-photo");
      console.log("Thumbnail clicked:", imageUrl); // Debugging
      if (imageUrl) {
        openImagePopup(imageUrl);
      } else {
        console.error("Image URL is invalid or missing.");
      }
    });
  });
}

function displayResults(results) {
    // console.log("==>", results);
  table = $("#results-table").DataTable();
  table.destroy();
  const resultsBody = document.getElementById("results-body");
  resultsBody.innerHTML = null;
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

    row.addEventListener("dblclick", function () {
      window.open(
        "/app/photo-viewer/?file_id=" + item.file_id + "&file_name=photo",
        "_blank"
      );
    });

    // Initialize nullable data
    let attributes = item.attributes
      ? JSON.stringify(item.attributes).replaceAll("\\", "").replaceAll('"', "")
      : "";
    let extra_data = item.extra_data
      ? JSON.stringify(item.extra_data).replaceAll("\\", "").replaceAll('"', "")
      : "";
    let people = item.people
      ? item.people
          .replaceAll(",", ", ")
          .replaceAll("{", "")
          .replaceAll("}", "")
      : "";
    let places = item.places
      ? item.places
          .replaceAll(",", ", ")
          .replaceAll("{", "")
          .replaceAll("}", "")
      : "";
    let tags = item.tags ? customTrim(item.tags, "[]") : "";
    let texts = item.texts ? customTrim(item.texts, "[]") : "";
    // console.log(item.file_url)
    let html = `
              <td>${item.file_id}</td>
              <td>
                <img id="thumbnail_${item.file_id}" 
                     class="thumbnail" 
                     data-image-url="${item.file_url}" 
                     src="${item.file_url}" 
                     alt="thumbnail" />
                     
              </td>
              <td>${item.title ? item.title : "None"}</td>
              <td class="file-name"><a href="${
                item.file_url
              }" class="hyperlink" target="_blank">${item.file_name}</a><br><br>
                  <a href="#" onclick="goToFaces(${item.file_id},'${
      item.file_name
    }')">Faces</a></td>
              <td>${item.extension.toUpperCase().replaceAll(".", "")}</td>
              <td>${item.media_source}</td>
              <td>${formatSize(item.size)}</td>
              <td>${formatDate(item.date_created)}</td>
              <td>${formatDate(item.date_uploaded)}</td>`;
    if (item.description == null)
      html += `<td class='field-description'>&nbsp;</td>`;
    else html += `<td class='field-description'>${item.description}</td>`;
    html += `
              <td>${tags}</td>
              <td>${people}</td>
              <td>${places}</td>
              <td>${texts}</td>
              <td>${formatDate(item.last_accessed)}</td>`;
    if (item.owner_name == null) html += "<td>None</td>";
    else html += `<td>${item.owner_name}</td>`;
    if (item.group_name == null) html += "<td>None</td>";
    else html += `<td>${item.group_name}</td>`;
    if (item.remarks == null) html += "<td>None</td>";
    else html += `<td>${item.remarks}</td>`;
    html += `
              <td>${item.version}</td>
              <td>${attributes}</td>`;
    if (item.extra_data == null) html += "<td>None</td>";
    else html += `<td>${extra_data}</td>`;
    html += `<td>${item.file_status}</td>`;
    html += `<td>${item.creator}</td>`;
    html += `<td>${item.subject}</td>`;
    html += `<td>${item.publisher}</td>`;
    html += `<td>${item.contributor}</td>`;
    html += `<td>${item.identifier}</td>`;
    html += `<td>${item.language}</td>`;
    html += `<td>${item.relation}</td>`;
    html += `<td>${item.coverage}</td>`;
    html += `<td>${item.rights}</td>`;

    row.innerHTML = html;
    resultsBody.appendChild(row);
  });

  const thumbnails = document.querySelectorAll(".thumbnail");
  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => {
      const imageUrl = thumbnail.getAttribute("data-image-url");
      console.log("Thumbnail URL:", imageUrl); // Debugging
      if (imageUrl) {
        openImagePopup(imageUrl);
      } else {
        console.error("Image URL is invalid or missing.");
      }
    });
  });

}
document.getElementById("toggleViewBtn").addEventListener("click", function () {
  const tableView = document.getElementById("results");
  const tileView = document.getElementById("tiles-results-photo");

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
// ========
// Popup handling
function openImagePopup(imageUrl) {
  if (!imageUrl) {
    console.error("Cannot open popup. Invalid image URL.");
    return;
  }

  const popup = document.createElement("div");
  popup.className = "image-popup";
  popup.innerHTML = `
      <div class="popup-content">
        <button class="close-popup" onclick="closeImagePopup()">X</button>
        <img src="${imageUrl}" alt="Popup Image" />
      </div>`;
  document.body.appendChild(popup);
}

function closeImagePopup() {
  const popup = document.querySelector(".image-popup");
  if (popup) {
    popup.remove();
  }
}

// ===================

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
            if (imageObj) imageObj.src = imageUrl;
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
  searchPhotos(document.getElementById("search-box").value, currentFolder);
//   applyFilters();
}

function displayError(message) {
  const resultsBody = document.getElementById("results-body");
  resultsBody.innerHTML = `<tr><td colspan="20">${message}</td></tr>`;
}

function browseFolder(parent_id = 1) {
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
      const folderBrowser = document.getElementById("folder-browser");
      folderBrowser.innerHTML = "";
      const rootFolder = createRootFolder();
      folderBrowser.appendChild(rootFolder);

      folders.results.forEach((folder) => {
        rootFolder.appendChild(createFolderElement(rootFolder, folder));
      });

      folderBrowser.classList.remove("folder-browser-hidden");
      folderBrowser.classList.add("folder-browser-visible");

      const breadCrumbs = document.getElementById("bread-crumbs");
      const rect = breadCrumbs.getBoundingClientRect();
      folderBrowser.style.top = rect.y + rect.height + "px";
      folderBrowser.style.left = rect.x + "px";
    })
    .catch((error) => {
      console.log(error);
      alert("An error occurred while fetching folders.");
    });
//   applyFilters();
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
  setCookie('PhotoBox.currentFolder',currentFolder,7*24*60*60);
}

function setMaxRows(value) {
  maxRows = value;
  const maxRowsUL = document.getElementById("max-rows-options");
  const maxRowsLIs = maxRowsUL.querySelectorAll("li");
  maxRowsLIs.forEach((li) => {
    if (li.id == "li-" + maxRows.toString()) {
      li.style.listStyleType = "disc";
      setCookie("PhotoBox.maxRows",value);
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
      "Media-Type": "photo",
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

