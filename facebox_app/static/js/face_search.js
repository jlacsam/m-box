const SUBSCRIPTION_ID = "00000000";
const CLIENT_SECRET = "00000000";
const MAX_ROWS = 25;
const MSG_DEFAULT1 = "Drag and drop a JPEG image here.";
const MSG_DEFAULT2 =
  "Or, click search to see all unique faces in the selected video.";

let lastFace = null;
let lastPerson = null;
let uploadedImage = null;
let totalResults = 0;
let selectedVideo = "0";
let selectedVideoName = "";
let editorDiv = null;
let editorFN = null;
let editorMN = null;
let editorLN = null;
let maxRows = MAX_ROWS;

let linkedFaceSourceImageID = null;
var mergeCheckBox = 'inline-block';

document.addEventListener("DOMContentLoaded", function () {
  const dropZone = document.getElementById("drop-zone");
  const preview = document.getElementById("preview");
  const fileName = document.getElementById("fileName");
  const similaritySlider = document.getElementById("similarity-slider");
  const similarityValue = document.getElementById("similarity-value");
  const searchButton = document.getElementById("search-button");
  const linkFacesButton = document.getElementById("link-faces-button");
  const unlinkFacesButton = document.getElementById("unlink-faces-button");

  const mergeButton = document.getElementById("merge-button");
  const resetButton = document.getElementById("reset-button");
  const msgDiv = document.getElementById("dnd_msg");
  const resultsDiv = document.getElementById("results");
  const searchBox = document.getElementById("search-box");
  const closeSearchFilter = document.getElementById("close-search-filter");
  const facesTab = document.getElementById("faces-tab");
  const profileIcon = document.getElementById("profile");



  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    let imageProperties = {};
    e.preventDefault();
    dropZone.classList.remove("dragover");
    cancel = false;
        // Get the dropped image data
        const droppedFiles = e.dataTransfer.files;
        const droppedItems = e.dataTransfer.items;
    
        // Check for dragged image elements
        if (e.dataTransfer.getData('text/html')) {
            const draggedHTML = e.dataTransfer.getData('text/html');
            const parser = new DOMParser();
            const doc = parser.parseFromString(draggedHTML, 'text/html');
            const imgElement = doc.querySelector('img');
    
            if (imgElement) {
                imageProperties = {
                    src: imgElement.src,
                    alt: imgElement.alt || '',
                    width: imgElement.width || '',
                    height: imgElement.height || '',
                    title: imgElement.title || '',
                    id: imgElement.id || '',
                    person_id: imgElement.dataset.personId || '',
                    className: imgElement.className || '',
                    // Get all data attributes
                    dataset: Object.assign({}, imgElement.dataset),
                    // Get any custom attributes
                    attributes: Array.from(imgElement.attributes).reduce((acc, attr) => {
                        acc[attr.name] = attr.value;
                        return acc;
                    }, {})
                };

                linkedFaceSourceImageID = imageProperties.person_id;
                console.log('Linked Face Source Image ID:', linkedFaceSourceImageID);
                console.log('Image Properties:', imageProperties.id);
               
            } else {
                console.log('No image element found in the dragged content.');

            }
        }
    if (totalResults > 0) {
      if (confirm("Do you want to clear the current results?")) {
        resetPage();
      } else {
        cancel = true;
      }
    }

    const files = e.dataTransfer.files;
    if (files.length > 0 && !cancel) {
      const file = files[0];
      if (file.type === "image/jpeg" || file.type === "image/png") {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            if (img.width > 500 || img.height > 500) {
              alert(
                `Image resolution exceeds 500x500. Please upload a smaller image.`
              );
            } else {
              // If resolution is valid, proceed to display the image
          preview.src = event.target.result;
          preview.style.display = "block";
          preview.style.visibility = "visible";
          fileName.textContent = file.name;
          msgDiv.style.visibility = "hidden";
          msgDiv.style.display = "none";
          uploadedImage = file;
            }
          };
        };
        reader.readAsDataURL(file);
      } else {
        fileName.textContent = `Invalid file type. Please upload a JPEG or PNG image.`;
      }
    }
    if (imageProperties.hasOwnProperty("id")) {
      // Use the image properties as needed
      searchButton.style.display = 'none';
      linkFacesButton.style.display = 'inline-block';
      mergeButton.style.display = 'none';
      unlinkFacesButton.style.display = 'inline-block';
      console.log('Image Properties:', imageProperties);
      mergeCheckBox = 'inline-block';
    } else {
      // Handle the case where image properties are not available
      console.log('No image properties found.');
      mergeCheckBox = 'none';
      console.log(mergeCheckBox)
    }

  });

  similaritySlider.addEventListener("input", (e) => {
    similarityValue.textContent = e.target.value;
  });

  linkFacesButton.addEventListener("click", async () => {
    if (uploadedImage) {
      getLinkedFaces();
    } else {
      if (selectedVideo != "0") {
        searchPersons();
      } else {
        const response = confirm(
          "All unique persons will be displayed. Continue?"
        );
        if (response) {
          searchPersons();
        }
      }
    }
  });
  searchButton.addEventListener("click", async () => {
    if (uploadedImage) {
      searchFaces();
    } else {
      if (selectedVideo != "0") {
        searchPersons();
      } else {
        const response = confirm(
          "All unique persons will be displayed. Continue?"
        );
        if (response) {
          searchPersons();
        }
      }
    }
  });

  resetButton.addEventListener("click", async () => {
    resetPage();
  });

  searchBox.addEventListener("click", async () => {
    performSearch();
  });

  searchBox.addEventListener("keyup", (e) => {
    if (e.key)
      if (
        e.key == "Control" ||
        e.key == "Shift" ||
        e.key == "Alt" ||
        e.key.startsWith("Arrow")
      )
        return;

    searchButton.style.display = 'inline-block';
    linkFacesButton.style.display = 'none';
    mergeButton.style.display = 'inline-block';
    unlinkFacesButton.style.display = 'none';
    performSearch();
  });

  //     mergeButton.addEventListener('click', async () => {
  //         document.querySelector(".custom-model-main").classList.add("model-open");
  //         const checkedBoxes = document.querySelectorAll('input[type="checkbox"]:checked');
  //         checkedBoxes.forEach(checkbox => {
  //     // console.log(checkbox.value); // get the value
  //     // console.log(checkbox.name);  // get the name
  //     console.log(checkbox.dataset.personId);
  // });
  //     });

  unlinkFacesButton.addEventListener("click", function () { 
    const selectedFaces = getSelectedFaces(); // You'll need to implement this based on your data structure
    const personsList = selectedFaces.map(face => parseInt(face.faceId));
    console.log(personsList)
    if (selectedFaces.length === 0) {
      alert("No faces selected.");
      return;
    }

    if (confirm("Are you sure you want to unlink these faces?")) {
      unLinkFaces(parseInt(linkedFaceSourceImageID), personsList)
    }

  });

  mergeButton.addEventListener("click", function () {
    // Show the modal
    document.querySelector(".custom-model-main").classList.add("model-open");

    // Get your data (assuming you have selected faces data)
    const selectedFaces = getSelectedFaces(); // You'll need to implement this based on your data structure

    // Create table HTML
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Select</th>
                    <th>Image</th>
                    <th>Name</th>
                    <!-- Add other headers as needed -->
                </tr>
            </thead>
            <tbody>`;

    // Add rows to table
    selectedFaces.forEach((face) => {
      tableHTML += `
            <tr>
                <td>
                    <input type="radio" 
                    value="${face.personId}"
                           data-person-id="${face.personId}" 
                           name="face-select">
                </td>
                <td><img src="${face.imageUrl}" alt="Face" width="50"></td>
                <td>${face.name}</td>
                <!-- Add other data cells as needed -->
            </tr>`;
    });

    tableHTML += `</tbody></table>`;

    // Insert table into the modal
    document.querySelector(".custom-model-main .table").innerHTML = tableHTML;
  });


  // Function to get selected faces (implement according to your data structure)
  function getSelectedFaces() {
    // Example implementation
    const checkedBoxes = document.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    const selectedFaces = Array.from(checkedBoxes).map((checkbox) => {
      return {
        faceId: checkbox.dataset.faceId,
        personId: checkbox.dataset.personId,
        imageUrl: getImageSrcByFaceId(checkbox.dataset.faceId),
        name: checkbox.dataset.name,
        // Add other properties as needed
      };
    });
    return selectedFaces;
  }

  // Add confirmation before merge
  document
    .getElementById("confirm-merge")
    .addEventListener("click", async function () {
      if (
        !confirm(
          "Are you sure you want to merge these persons? This action cannot be undone."
        )
      ) {
        return;
      }
      // ... rest of the merge logic
    });

  function getImageSrcByFaceId(faceId) {
    const imageId = `thumbnail_${faceId}`;
    const imageElement = document.getElementById(imageId);
    return imageElement ? imageElement.src : null;
  }

  closeSearchFilter.addEventListener("click", async () => {
    searchBox.value = "";
    searchBox.placeholder = "[Search all videos and photos]";
    hideSearchFilter();
  });

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

  facesTab.style.color = "#ffffff";

  setMaxRows(maxRows);
  getGroups();

  // A query parameter was passed to the page, display all faces associated with the file_id
  if (parseInt(q_file_id) > 0) {
    selectedVideo = q_file_id;
    selectedVideoName = q_file_name;
    searchBox.placeholder = "[Search " + q_file_name + "]";
    searchPersons();
  }
});



// Handle close button click
document.querySelector(".close-btn").addEventListener("click", function () {
  document.querySelector(".custom-model-main").classList.remove("model-open");
});

// Handle background overlay click
document.querySelector(".bg-overlay").addEventListener("click", function () {
  document.querySelector(".custom-model-main").classList.remove("model-open");
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

function unLinkFaces(person_id, unlinkPerson) {
  const csrftoken = getCookie("csrftoken");
  fetch(`/api/unlink-faces/${person_id}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "X-CSRFToken": csrftoken,
    },
    body: JSON.stringify(unlinkPerson)
  })
    .then((response) => response.json())
    .then((data) => {
      console.log(data)
      const searchButton = document.getElementById("search-button");
      const linkFacesButton = document.getElementById("link-faces-button");
      const unlinkFacesButton = document.getElementById("unlink-faces-button");
      const mergeButton = document.getElementById("merge-button");
      // if (data.success) {
        searchButton.style.display = 'none';
        linkFacesButton.style.display = 'inline-block';
        mergeButton.style.display = 'none';
        unlinkFacesButton.style.display = 'inline-block';
        // linkedFaceSourceImageID = null;
        unlinkFacesButton.disabled = true;
        if (uploadedImage) {
          getLinkedFaces();
        } else {
          if (selectedVideo != "0") {
            searchPersons();
          } else {
            const response = confirm(
              "All unique persons will be displayed. Continue?"
            );
            if (response) {
              searchPersons();
            }
          }
        }
      // }

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
  const searchBox = document.getElementById("search-box");
  let value = searchBox.value.trim();
  if (value.length == 0 || value == "*" || value == "?") return;
  if (isValidTsQueryString(value)) {
    showSearchFilter(value);
  } else if (isUnquoted(value) && containsSpace(value)) {
    // make the search string a valid TsQuery. Assume OR.
    value = trimWhitespaces(value).replaceAll(" ", " | ");
    showSearchFilter(value);
  }
}

function resetPage() {
  const preview = document.getElementById("preview");
  const fileName = document.getElementById("fileName");
  const msgDiv = document.getElementById("dnd_msg");
  const resultsDiv = document.getElementById("results");
  const moreDiv = document.getElementById("more");
  const searchBox = document.getElementById("search-box");
  const instrDiv = document.getElementById("instructions");
  const resultsLabel = document.getElementById("results-label");
  const searchButton = document.getElementById("search-button");
  const linkFacesButton = document.getElementById("link-faces-button");
  const unlinkFacesButton = document.getElementById("unlink-faces-button");
console.log("Called")
  const mergeButton = document.getElementById("merge-button");
  mergeCheckBox = 'inline-block';

  uploadedImage = null;
  lastFace = null;
  lastPerson = null;
  totalResults = 0;
  selectedVideo = "0";
  selectedVideoName = "";
  msgDiv.style.display = "flex";
  msgDiv.style.visibility = "visible";
  fileName.textContent = "";
  preview.style.display = "none";
  resultsDiv.innerHTML = "";
  moreDiv.innerHTML = "";
  searchBox.value = "";
  searchBox.placeholder = "[Search all videos and photos]";
  instrDiv.innerHTML = MSG_DEFAULT1;
  resultsLabel.innerHTML = "";

  searchButton.style.display = 'inline-block';
  linkFacesButton.style.display = 'none';
  mergeButton.style.display = 'inline-block';
  unlinkFacesButton.style.display = 'none';
  mergeButton.disabled = true
}

function searchFaces() {
  const csrftoken = getCookie("csrftoken");
  const similaritySlider = document.getElementById("similarity-slider");
  const formData = new FormData();
  formData.append("image", uploadedImage);

  document.body.style.cursor = 'wait';

  fetch("/api/search/", {
    method: "POST",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      Similarity: similaritySlider.value,
      "Video-List": selectedVideo,
      "Max-Rows": maxRows,
      "X-CSRFToken": csrftoken,
    },
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        results.innerHTML = `<p>Error: ${data.error}</p>`;
      } else {
        //displayResults(data);
        displayFaceTiles(data);
        displayFooter(data);
        displayThumbnails(data);
        updateResultsLabel();
        trackLastFace(data);
      }
      document.body.style.cursor = 'default';
    })
    .catch((error) => {
      results.innerHTML = `<p>ERROR: ${error.message}</p>`;
      document.body.style.cursor = 'default';
    });
}

function getLinkedFaces() {
  const csrftoken = getCookie("csrftoken");
  const similaritySlider = document.getElementById("similarity-slider");
  const formData = new FormData();
  formData.append("image", uploadedImage);
  mergeCheckbox = 'inline-block';
  fetch(`/api/get-linked-faces/${parseInt(linkedFaceSourceImageID)}/`, {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      Similarity: similaritySlider.value,
      "Video-List": selectedVideo,
      "Max-Rows": maxRows,
      "X-CSRFToken": csrftoken,
    },
    // body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        results.innerHTML = `<p>Error: ${data.error}</p>`;
      } else {
        //displayResults(data);
        displayFaceTiles(data);
        displayFooter(data);
        displayThumbnails(data);
        updateResultsLabel();
        trackLastFace(data);
      }
    })
    .catch((error) => {
      results.innerHTML = `<p>ERROR: ${error.message}</p>`;
    });
}

function mergeOnChange(type) {
  if ( type == "unlink" & linkedFaceSourceImageID != null) {
    const checkedBoxes = document.querySelectorAll("#merge_faces:checked");
    const unlinkFaces = document.getElementById("unlink-faces-button");
    console.log(type, linkedFaceSourceImageID)
    if (checkedBoxes.length > 0) {
      unlinkFaces.disabled = false
    } else {
      unlinkFaces.disabled = true
    }
  } else {
    const checkedBoxes = document.querySelectorAll("#merge_faces:checked");
    const mergeFaces = document.getElementById("merge-button");

    if (checkedBoxes.length > 1) {
      mergeFaces.disabled = false
    } else {
      mergeFaces.disabled = true
    }
  }
}

function searchMoreFaces() {
  const csrftoken = getCookie("csrftoken");
  const resultsDiv = document.getElementById("results");
  const moreDiv = document.getElementById("more");
  const similaritySlider = document.getElementById("similarity-slider");
  const scrollPosition = window.scrollY || window.pageYOffset;

  if (lastFace != null && uploadedImage != null) {
    const formData = new FormData();
    formData.append("image", uploadedImage);

    fetch("/api/search/", {
      method: "POST",
      headers: {
        "Subscription-ID": SUBSCRIPTION_ID,
        "Client-Secret": CLIENT_SECRET,
        Similarity: similaritySlider.value,
        "Video-List": selectedVideo,
        "Max-Rows": maxRows,
        "Start-From": JSON.stringify(lastFace),
        "X-CSRFToken": csrftoken,
      },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          results.innerHTML += `<p>Error: ${data.error}</p>`;
        } else {
          //displayResults(data,true);
          displayFaceTiles(data, true);
          displayFooter(data, true);
          displayThumbnails(data);
          updateResultsLabel();
          trackLastFace(data);
          window.scrollTo(0, scrollPosition);
        }
      })
      .catch((error) => {
        resultsDiv.innerHTML += `<p>ERROR: ${error.message}</p>`;
      });
  } else {
    console.log(
      "ERR: It shouldn't be possible to call this function if lastFace is null!"
    );
  }
}

function searchPersons() {
  const csrftoken = getCookie("csrftoken");
  fetch("/api/search-person/", {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Video-List": selectedVideo,
      "Max-Rows": maxRows,
      "X-CSRFToken": csrftoken,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        results.innerHTML = `<p>Error: ${data.error}</p>`;
      } else {
        displayPersonTiles(data);
        displayFooter(data, false, "searchMorePersons()");
        displayThumbnails(data);
        updateResultsLabel();
        trackLastPerson(data);
      }
    })
    .catch((error) => {
      results.innerHTML = `<p>ERROR: ${error.message}</p>`;
    });
}

function searchMorePersons() {
  const csrftoken = getCookie("csrftoken");
  const resultsDiv = document.getElementById("results");
  const moreDiv = document.getElementById("more");
  const scrollPosition = window.scrollY || window.pageYOffset;

  if (lastPerson == null) {
    console.log(
      "ERR: It shouldn't be possible to call this function if lastPerson is null!"
    );
    return;
  }

  fetch("/api/search-person/", {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Video-List": selectedVideo,
      "Max-Rows": maxRows,
      "Start-From": JSON.stringify(lastPerson),
      "X-CSRFToken": csrftoken,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        results.innerHTML = `<p>Error: ${data.error}</p>`;
      } else {
        displayPersonTiles(data, true);
        displayFooter(data, true, "searchMorePersons()");
        displayThumbnails(data);
        updateResultsLabel();
        trackLastPerson(data);
        window.scrollTo(0, scrollPosition);
      }
    })
    .catch((error) => {
      results.innerHTML = `<p>ERROR: ${error.message}</p>`;
    });
}

function displayResults(data) {
  console.log(mergeCheckbox)
  let html =
    "<table><tr><th>Face ID</th><th>File ID</th><th>Person ID</th><th>Time Start</th><th>Time End</th><th>Box</th><th>Confidence</th><th>Merged To</th><th>Thumbnail</th></tr>";
  const items = data.results;
  items.forEach((item) => {
    html += `<tr>
                <td>${item.face_id}</td>
                <td>${item.file_id}</td>
                <td>${item.person_id}</td>
                <td>${formatTime(item.time_start)}</td>
                <td>${formatTime(item.time_end)}</td>
                <td>${JSON.stringify(item.box)}</td>
                <td>${item.confidence}</td>
                <td>${item.merged_to}</td>
                <td><img id="thumbnail_${
                  item.face_id
                }" src="" alt="thumbnail"></td>
            </tr>`;
  });
  html += "</table>";
  results.innerHTML = html;
}

function displayFaceTiles(data, append = false) {
  console.log(mergeCheckBox)
  let html = "";
  const items = data.results;
  items.forEach((item) => {
    similarity = (100.0 * item.similarity).toFixed(2);
    box = JSON.stringify(item.box).replaceAll("\\", "").replaceAll('"', "");
    tile = `<div class="tile"><table class="tile_table"><tr><td>
            <table>
                <tr><td><img id="thumbnail_${
                  item.face_id
                }" class="thumbnail" data-face-id= ${item.face_id} data-person-id=${item.person_id} src="" alt="thumbnail"></td></tr>
                <tr><td><div class="field_label">Similarity</div>
                    <div class="field_value">${similarity}%</div></td></tr>
            </table>
            </td><td>
            <table>
                <tr><td><div class="field_label">Filename</div>
                    <div class="field_value"><a href="${
                      item.file_url
                    }" class="hyperlink" target="_blank">${
      item.file_name
    }</a></div></td>
                    <td style="float:right"><input type="checkbox" onchange="mergeOnChange('unlink')" 
                             label="Unlink faces" 
                             style = "display: ${mergeCheckBox} "
                             id="merge_faces"
                             data-file-id="${item.file_id}"
                             data-name="${item.full_name}" 
                             data-face-id="${item.face_id}" 
                             data-person-id="${item.person_id}"  />
                    </td>
                    </tr>
                <tr><td><div class="field_label">Time range</div>
                    <div class="field_value">${formatTime(
                      item.time_start
                    )} - ${formatTime(item.time_end)}</div></td></tr>
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

// Search Faces thumbnail click popup=================
function openVideoPopup(videoUrl, startTime) {
  const popup = document.createElement("div");
  popup.className = "video-popup";
  if (videoUrl.includes(".jpg") || videoUrl.includes(".png") || videoUrl.includes(".jpeg")) {
    popup.innerHTML = `
        <div class="popup-content" >
          <button class="close-popup" onclick="closeVideoPopup()">X</button>
          <img style="max-width: 500px;max-height: 500px" src="${videoUrl}" alt="Image" />
        </div>`;

  } else {
  popup.innerHTML = `
        <div class="popup-content">
          <button class="close-popup" onclick="closeVideoPopup()">X</button>
          <video controls >
            <source src="${videoUrl}#t=${startTime}" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>`;
  }
  document.body.appendChild(popup);
}

function closeVideoPopup() {
  const popup = document.querySelector(".video-popup");
  if (popup) {
    popup.remove();
  }
}
// Search Faces thumbnail click popup end=================
// ====After Search Faces Tiles Shown below code=====
function displayPersonTiles(data, append = false) {
  console.log(mergeCheckBox)
  let html = "";
  const items = data.results;
  items.forEach((item) => {
    const confidence = item.confidence.toFixed(2);
    const box = JSON.stringify(item.box)
      .replaceAll("\\", "")
      .replaceAll('"', "");
    const tile = `
        <div class="tile">
          <table class="tile_table">
            <tr>
              <td>
                <table>
                  <tr>
                    <td>
                      <img  id="thumbnail_${item.face_id}" 
                           class="thumbnail cursor-pointer" 
                           src="" 
                           data-person-id=${item.person_id}
                           alt="thumbnail" 
                           data-video-url="${item.file_url}" 
                           data-start-time="${item.time_start}" />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div class="field_label">Confidence</div>
                      <div class="field_value">${confidence}%</div>
                    </td>
                  </tr>
                </table>
              </td>
              <td>
                <table class="table_fields">
                  <tr>
                    <td>
                      <div class="field_label">Name</div>
                      <div id="fullname_${item.face_id}" 
                           class="field_editable"
                           data-person_id="${item.person_id}" 
                           data-first_name="${item.first_name || ""}" 
                           data-middle_name="${item.middle_name || ""}"
                           data-last_name="${item.last_name || ""}">
                           ${item.full_name}
                      </div>
                    </td>
                    <td style="float:right">
                      <input type="checkbox" 
                             onchange="mergeOnChange('merge')" 
                             label="merge faces" 
                             style = "display: ${mergeCheckBox}"
                             data-name="${item.full_name}" 
                             data-face-id="${item.face_id}" 
                             data-person-id="${item.person_id}" 
                             id="merge_faces" />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div class="field_label">Filename</div>
                      <div class="field_value">
                        <a href="${item.file_url}" 
                           class="hyperlink" 
                           target="_blank">
                           ${item.file_name}
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div class="field_label">Time range</div>
                      <div class="field_value">
                        ${formatTime(item.time_start)} - ${formatTime(
      item.time_end
    )}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div class="field_label">Bounding box</div>
                      <div class="field_value">${box}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>`;
    html += tile;
  });

  if (append) {
    totalResults += items.length;
    results.innerHTML += html;
  } else {
    totalResults = items.length;
    results.innerHTML = html;
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

  const editables = document.getElementsByClassName("field_editable");
  Array.from(editables).forEach((editable) => {
    editable.addEventListener("dblclick", () => showEditor(editable));
  });

}
// ====After Search Faces Tiles Shown code end=====
function displayThumbnails(data) {
  console.log(mergeCheckBox)
  const csrftoken = getCookie("csrftoken");
  const items = data.results;
  items.forEach((item) => {
    fetch(`/api/get-image/${item.face_id}/`, {
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
        // Create a URL for the blob and display it as an image
        const imageUrl = URL.createObjectURL(blob);
        const imageObj = document.getElementById("thumbnail_" + item.face_id);
        if (imageObj) imageObj.src = imageUrl;
      })
      .catch((error) => {
        console.error("There was a problem with the fetch operation:", error);
        document.getElementById("imageDisplay").innerHTML =
          "<p>Error loading image</p>";
      });
  });
}

function displayFooter(data, append = false, clickfn = "searchMoreFaces()") {
  const moreDiv = document.getElementById("more");
  const items = data.results;
  if (items.length == maxRows) {
    let html = '<a href="#" onclick="' + clickfn + '">more</a>';
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
  const resultsLabel = document.getElementById("results-label");
  if (selectedVideo != "0") {
    resultsLabel.innerHTML =
      "Showing " + totalResults + " unique faces from " + selectedVideoName;
  } else if (uploadedImage) {
    if (linkedFaceSourceImageID) {
      resultsLabel.innerHTML =
      "Showing " + totalResults + " linked faces.";
    } else {
      resultsLabel.innerHTML =
      "Showing " + totalResults + " matching faces from all videos/photos.";
    }

  } else {
    resultsLabel.innerHTML =
      "Showing " + totalResults + " unique faces in the database.";
  }
}

function trackLastFace(data) {
  const items = data.results;
  if (items.length > 0) {
    let lastRecord = items[items.length - 1];
    lastFace = {
      face_id: lastRecord.face_id,
      similarity: lastRecord.similarity,
    };
  } else {
    lastFace = null;
  }
}

function trackLastPerson(data) {
  const items = data.results;
  if (items.length > 0) {
    let lastRecord = items[items.length - 1];
    lastPerson = { person_id: lastRecord.person_id };
  } else {
    lastPerson = null;
  }
}

function showSearchFilter(value = "") {
  const csrftoken = getCookie("csrftoken");
  const searchBox = document.getElementById("search-box");
  const searchFilter = document.getElementById("search-filter");
  const videoList = document.getElementById("video-list");

  const rect1 = searchBox.getBoundingClientRect();
  const rect2 = searchFilter.getBoundingClientRect();
  let x = rect1.x - (rect2.width - rect1.width) / 2;
  let y = rect1.y + rect1.height + 2;

  searchFilter.style.left = x + "px";
  searchFilter.style.top = y + "px";
  searchFilter.classList.remove("filter-hidden");
  searchFilter.classList.add("filter-visible");

  fetch("/api/search-video/", {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Max-Rows": maxRows,
      "Start-From": 0,
      Pattern: value,
      Scope: "/",
      "X-CSRFToken": csrftoken,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        results.innerHTML += `<p>Error: ${data.error}</p>`;
      } else {
        if (data.results.length > 0) {
          listVideos(data);
        } else {
          videoList.innerHTML = "No matching records found.";
        }
      }
    })
    .catch((error) => {
      results.innerHTML += `<p>ERROR: ${error.message}</p>`;
    });
}

function hideSearchFilter() {
  const searchFilter = document.getElementById("search-filter");

  searchFilter.style.top = "0px";
  searchFilter.classList.remove("filter-visible");
  searchFilter.classList.add("filter-hidden");
}

function listVideos(data) {
  const items = data.results;
  const videoList = document.getElementById("video-list");
  let html = "<table>";
  items.forEach((item) => {
    html += `<tr><td class="video-item" onclick="selectVideo(${item.file_id},'${
      item.file_name
    }')">
            <div class="video-name">${item.file_name}</div>
            <div class="video-desc">${truncateAtWord(
              item.description
            )}</div></td></tr>`;
  });
  html += "</table>";
  videoList.innerHTML = html;
}

function selectVideo(file_id, file_name) {
  if (totalResults > 0) {
    if (confirm("Do you want to clear the current results?")) {
      resetPage();
    } else {
      return;
    }
  }

  const searchBox = document.getElementById("search-box");
  const instrDiv = document.getElementById("instructions");

  hideSearchFilter();
  searchBox.value = "";
  searchBox.placeholder = "[Search " + file_name + "]";
  instrDiv.innerHTML = MSG_DEFAULT1 + " " + MSG_DEFAULT2;
  selectedVideo = file_id;
  selectedVideoName = file_name;
}

function showEditor(editable) {
  if (editorDiv == null) {
    editorDiv = document.getElementById("editor-div");
    editorFN = document.getElementById("first_name");
    editorMN = document.getElementById("middle_name");
    editorLN = document.getElementById("last_name");
  }

  if (editorDiv.classList.contains("editor-visible")) {
    return;
  }

  editorFN.value = editable.dataset.first_name;
  editorMN.value = editable.dataset.middle_name;
  editorLN.value = editable.dataset.last_name;

  editorDiv.classList.remove("editor-hidden");
  editorDiv.classList.add("editor-visible");

  const rect = editable.getBoundingClientRect();
  editorDiv.style.width = rect.width + "px";
  editorDiv.style.height = rect.height + "px";

  // Store the value of the editable into an attribute
  editorDiv.setAttribute("original-id", editable.id);
  editorDiv.setAttribute("original-value", editable.innerHTML);
  editorDiv.setAttribute("original-person-id", editable.dataset.person_id);
  editable.innerHTML = "";

  // Remove the editorDiv from its current parent, then append to a new parent
  editorDiv.remove();
  editable.appendChild(editorDiv);
}

function saveEdits() {
  const first_name = editorFN.value;
  const middle_name = editorMN.value;
  const last_name = editorLN.value;
  const full_name = (first_name + " " + middle_name + " " + last_name).trim();

  // Check if there is something to save
  if (editorDiv.getAttribute("original-value") == full_name) {
    console.log("Nothing to save.");
    cancelEdits();
    return;
  }

  let person = {};
  person["first_name"] = first_name;
  person["middle_name"] = middle_name;
  person["last_name"] = last_name;

  const person_id = editorDiv.getAttribute("original-person-id");
  const csrftoken = getCookie("csrftoken");
  fetch(`/api/update-person/${person_id}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "X-CSRFToken": csrftoken,
    },
    body: JSON.stringify(person),
  })
    .then((response) => response.json())
    .then((data) => {
      editorDiv.classList.remove("editor-visible");
      editorDiv.classList.add("editor-hidden");
      const editable = document.getElementById(
        editorDiv.getAttribute("original-id")
      );
      editable.innerHTML = sanitizeHtml(full_name);
      editable.dataset.first_name = first_name;
      editable.dataset.middle_name = middle_name;
      editable.dataset.last_name = last_name;
    })
    .catch((error) => {
      alert("Unable to save data.");
      console.log(error);
    });
}

function cancelEdits() {
  const editable = document.getElementById(
    editorDiv.getAttribute("original-id")
  );
  editorDiv.classList.remove("editor-visible");
  editorDiv.classList.add("editor-hidden");
  editable.innerHTML = editorDiv.getAttribute("original-value");
}

function toggleAudit() {
  const settingsMenu = document.getElementById("settings-menu");
  settingsMenu.classList.remove("popup-visible");
  settingsMenu.classList.add("popup-hidden");

  const auditLog = document.getElementById("audit-log");
  const menuItem = document.getElementById("menu-audit");
  if (auditLog.classList.contains("audit-hidden")) {
    auditLog.classList.remove("audit-hidden");
    auditLog.classList.add("audit-visible");
    menuItem.innerHTML = "Hide audit";
    getAudit(0);
  } else {
    auditLog.classList.remove("audit-visible");
    auditLog.classList.add("audit-hidden");
    menuItem.innerHTML = "Show audit";
  }
}

function getAudit(file_id) {
  const csrftoken = getCookie("csrftoken");
  fetch(`/api/get-audit/${file_id}/`, {
    method: "GET",
    headers: {
      "Subscription-ID": SUBSCRIPTION_ID,
      "Client-Secret": CLIENT_SECRET,
      "Max-Rows": maxRows,
      "Source-Table": "mbox_face",
      "X-CSRFToken": csrftoken,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        console.log(data.error);
      } else {
        displayAudit(data.results);
      }
    })
    .catch((error) => {
      console.log(error);
    });
}

function displayAudit(results) {
  const auditLog = document.getElementById("audit-log");
  if (results.length === 0) {
    auditLog.innerHTML = "No audit records yet.";
    return;
  }

  let html =
    '<table><tr><td><p style="font-weight:bold; color:black;">AUDIT LOG</p><br></td></tr>';
  results.forEach((item) => {
      html += `<tr><td>
        <p class='audit-detail'>${item.audit_id} (${item.record_id})</p>
        <p class='audit-detail'><span class='audit-key'>Username:</span>&nbsp;${
          item.username
        }</p>
        <p class='audit-detail'><span class='audit-key'>Action:</span>&nbsp;${
          item.activity
        }</p>
        <p class='audit-detail'><span class='audit-key'>Timestamp:</span>&nbsp;${
          item.event_timestamp
        }</p>
        <p class='audit-detail'><span class='audit-key'>IP Location:</span>&nbsp;${
          item.location
        }</p>
        <p class='audit-detail'><span class='audit-key'>Old Data:</span>&nbsp;<pre class="json-highlight" style="display: inline; white-space: pre-wrap; word-wrap: break-word;">${formatJsonString(
          item.old_data
        )}</pre></p>
        <p class='audit-detail'><span class='audit-key'>New Data:</span>&nbsp;<pre class="json-highlight" style="display: inline; white-space: pre-wrap; word-wrap: break-word;">${formatJsonString(
          item.new_data
        )}</pre></p>
        <hr></td></tr>`;
  });

  auditLog.innerHTML = html;
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

document
  .getElementById("confirm-merge")
  .addEventListener("click", async function () {
    // if (!confirm('Are you sure you want to merge these persons? This action cannot be undone.')) {
    //     return;
    // }
    // Get the selected radio button value (target person_id for URL)
    const targetPersonId = document.querySelector(
      'input[name="face-select"]:checked'
    )?.dataset.personId;

    // Get all checked checkboxes from the main view (persons to be merged)
    const checkedBoxes = document.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    const personIdsToMerge = Array.from(checkedBoxes).map((checkbox) =>
      parseInt(checkbox.dataset.personId)
    );

    // Validate selections
    if (!targetPersonId) {
      alert("Please select a target person to merge into");
      return;
    }

    if (personIdsToMerge.length === 0) {
      alert("Please select persons to merge");
      return;
    }

    try {
      const csrftoken = getCookie("csrftoken");
      // Make the API call
      const response = await fetch(`/api/merge-persons/${targetPersonId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Subscription-ID": SUBSCRIPTION_ID, // Implement this function
          "Client-Secret": CLIENT_SECRET, // Implement this function
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify(personIdsToMerge),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // console.log(data);

      // Close the modal
      document
        .querySelector(".custom-model-main")
        .classList.remove("model-open");

      // Refresh the page or update the UI as needed
      // location.reload(); // Or implement a more specific UI update
      if (uploadedImage) {
        searchFaces();
      } else {
        if (selectedVideo != "0") {
          searchPersons();
        } else {
          const response = confirm(
            "All unique persons will be displayed. Continue?"
          );
          if (response) {
            searchPersons();
          }
        }
      }
    } catch (error) {
      console.error("Error during merge:", error);
      alert("Failed to merge persons. Please try again.");
    }
  });
