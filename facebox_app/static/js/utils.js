function accessRightsToStr(owner_rights, group_rights, domain_rights, public_rights) {
    // Validate input parameters
    const params = [owner_rights, group_rights, domain_rights, public_rights];

    // Convert a single number (0-7) to rwx format
    function convertToRWX(num) {
        const read = (num & 4) ? 'r' : '-';    // Check third bit
        const write = (num & 2) ? 'w' : '-';   // Check second bit
        const execute = (num & 1) ? 'x' : '-'; // Check first bit
        return read + write + execute;
    }

    // Convert each parameter and concatenate
    const ownerPerm = convertToRWX(owner_rights);
    const groupPerm = convertToRWX(group_rights);
    const domainPerm = convertToRWX(domain_rights);
    const publicPerm = convertToRWX(public_rights);

    return ownerPerm + '|' + groupPerm + '|' + domainPerm + '|' + publicPerm;
}

function containsHtmlBreakingChars(str) {
  const dangerousChars = /[<>&'"]/;
  return dangerousChars.test(str);
}

function coalesce(val) {
    if (val == null) return "";
    else return val;
}

function containsSpace(str) {
    return /\s/.test(str);
}

function customTrim(str, chars) {
  const charSet = new Set(chars); // Convert chars to a set for efficient lookup
  
  let start = 0, end = str.length - 1;
  while (start < str.length && charSet.has(str[start])) start++;
  while (end >= 0 && charSet.has(str[end])) end--;
  
  return str.substring(start, end + 1);
}

function dequote(str) {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

function desanitizeHtml(str) {
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&nbsp;': " "
  };
  
  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;|&nbsp;/g, function(m) { return map[m]; }).trim();
}

function formatDate(dateString) {
    if (dateString == null)
        return "N/A";
    else
        return new Date(dateString).toLocaleString();
}

function formatGMTToLocal(dateString) {
  // Parse the input date string in GMT/UTC timezone
  const date = new Date(dateString + 'Z');

  // Get the local date and time components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  // Return the formatted date and time in the local timezone
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function formatJsonString(jsonString) {
  function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'key';
        } else {
          cls = 'string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'boolean';
      } else if (/null/.test(match)) {
        cls = 'null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    });
  }

  let obj = JSON.parse(jsonString);
  let formattedJson = JSON.stringify(obj, null, 2).replace(/\n+/g,' ');
  let highlightedJson = syntaxHighlight(formattedJson);
  return highlightedJson;
}

function formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 12);
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function goToFaces(file_id,file_name) {
    href = "/app/faces/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function goToVoices(file_id,file_name) {
    href = "/app/voices/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function goToPhotos(file_id,file_name) {
    href = "/app/photos/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function goToAudios(file_id,file_name) {
    href = "/app/audios/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function goToVideos(file_id,file_name) {
    href = "/app/videos/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function goToLibrary(file_id,fileName) {
    href = "/app/library/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function goToReports(file_id,fileName) {
    href = "/app/reports/";
    if (file_id != null && file_name != null) {
        file_name = encodeURIComponent(file_name);
        href += '?file_id=' + file_id + '&file_name=' + file_name;
    }
    window.location.href = href;
}

function hasInvalidChars(str) {
    const invalid_chars = "*?'\"";
    const regex = new RegExp(`[${invalid_chars}]`);
    return regex.test(str);
}

function isProperlyQuoted(str) {
    return /^(['"]).*\1$/.test(str);
}

function isProperlyQuotedOrUnquoted(str) {
    return /^(['"]).*\1$|^[^'"].*[^'"]$/.test(str);
}

function isValidJPEG(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            const arr = (new Uint8Array(e.target.result)).subarray(0, 4);
            let header = '';
            for(let i = 0; i < arr.length; i++) {
                header += arr[i].toString(16);
            }

            // Check for JPEG magic numbers
            if (header === "ffd8ffe0" || header === "ffd8ffe1" || header === "ffd8ffe2" || header === "ffd8ffe3" || header === "ffd8ffe8") {
                resolve(true);
            } else {
                resolve(false);
            }
        };

        reader.onerror = function() {
            reject(false);
        };

        reader.readAsArrayBuffer(blob);
    });
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (err) {
        return false;
    }
}

function isUnquoted(str) {
  return /^[^'"].*[^'"]$/.test(str.trim());
}

function isValidTsQueryString(queryString) {
    // Remove leading and trailing whitespace
    queryString = queryString.trim();

    // Check if the string is empty
    if (queryString.length === 0) {
        return false;
    }

    // Check for quoted strings
    if ((queryString.startsWith('"') && queryString.endsWith('"')) || 
        (queryString.startsWith("'") && queryString.endsWith("'"))) {
        return true;
    }

    // Regular expression for valid tokens
    const validTokenRegex = /^[a-zA-Z0-9\-_:*]+$/;

    // Split the string into tokens
    const tokens = queryString.split(/\s+/);

    let openParenCount = 0;
    let expectingOperator = false;
    let expectingWord = true;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Check for valid operators
        if (['&', '|', '!'].includes(token)) {
            expectingOperator = false;
            expectingWord = true;
            continue;
        }

        // Check for parentheses
        if (token === '(') {
            if (!expectingWord) {
                return false; // Parentheses not allowed in the middle of a phrase
            }
            openParenCount++;
            expectingWord = false;
            continue;
        }
        if (token === ')') {
            if (openParenCount === 0) {
                return false; // Mismatched parentheses
            }
            openParenCount--;
            expectingOperator = true;
            expectingWord = true;
            continue;
        }

        // Check if the token is valid
        if (!validTokenRegex.test(token)) {
            return false;
        }

        // If we're expecting a word, it's valid
        if (expectingWord) {
            expectingOperator = true;
            expectingWord = false;
        } else {
            return false; // Unexpected word
        }
    }

    // Check if all parentheses are closed
    if (openParenCount !== 0) {
        return false;
    }

    return true;
}

function sanitizeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  
  return str.replace(/[&<>"']/g, function(m) { return map[m]; }).trim();
}

function sanitizeJson(str) {
    if (str == null) {
        return "{}";
    }
    return JSON.stringify(str).replaceAll("\\","").replaceAll('"',"");
}

function timeElapsed(dateString) {
    if (dateString == null) {
        return "N/A";
    }

    if (!dateString.endsWith('Z')) dateString += 'Z';
    const inputDate = new Date(dateString);
    const now = new Date(); // Current time in the browser's local timezone

    const timeDiff = now - inputDate; // Time difference in milliseconds
    const seconds = Math.floor(timeDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
        return `${seconds} seconds ago`;
    } else if (minutes < 60) {
        return `${minutes} minutes ago`;
    } else if (hours < 24) {
        return `${hours} hours ago`;
    } else if (days < 30) {
        return `${days} days ago`;
    } else {
        return `over ${days} days ago`;
    }
}

function timeToStr(seconds) {
  // Ensure we're working with a positive number
  seconds = Math.abs(seconds);

  // Calculate hours, minutes, seconds, and milliseconds
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.round((seconds % 1) * 1000);

  // Pad each component to ensure correct length
  const paddedHours = hours.toString().padStart(2, '0');
  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSeconds = secs.toString().padStart(2, '0');
  const paddedMilliseconds = milliseconds.toString().padStart(3, '0');

  // Construct and return the formatted string
  return `${paddedHours}:${paddedMinutes}:${paddedSeconds}.${paddedMilliseconds}`;
}

function trimWhitespaces(str) {
    return str.replace(/\s+/g, ' ');
}

function truncateAtWord(str, maxLength = 500, suffix = '...') {
    if (str === null) return '';
    if (str.length <= maxLength) return str;
    const idx = str.lastIndexOf(' ', maxLength);
    return idx !== -1 ? str.substring(0, idx) + suffix : str.substring(0, maxLength) + suffix;
}

function vttToHTML(vttString,class_name='cue-text') {
  const lines = vttString.trim().split('\n');
  
  let tableHTML = '<table id="vtt-table"><tbody>';
  let inCue = false;
  let cueStart = '';
  let cueEnd = '';
  let cueText = '';
  let rowCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (i === 0 && line === 'WEBVTT') {
      tableHTML += `<tr><td>${line}</td></tr>`;
    } else if (line === '') {
      if (inCue) {
        const paddedId = cueStart.replace(/[:\.]/g, '').padStart(9, '0');
        const cueEndZP = cueEnd.replace(/[:\.]/g, '').padStart(9, '0');
        tableHTML += `<tr id="${paddedId}" data-cueend="${cueEndZP}">
          <td><p>${cueStart}&nbsp;-->&nbsp;${cueEnd}</p>
          <p id="cue-text-${paddedId}" class="${class_name}"
              data-cuestart="${cueStart}" data-cueend="${cueEnd}">${cueText || '&nbsp;'}</p></td>
        </tr>`;
        inCue = false;
        cueStart = '';
        cueEnd = '';
        cueText = '';
      }
    } else if (line.includes('-->')) {
      inCue = true;
      [cueStart, cueEnd] = line.split(' --> ');
    } else if (inCue) {
      cueText += (cueText ? '<br>' : '') + line;
    } else if (!line.includes('-->')) {
      // Assume this is metadata
      tableHTML += `<tr><td>${line}</td></tr>`;
    }
  }

  // Add the last cue if exists
  if (inCue) {
    const paddedId = cueStart.replace(/[:\.]/g, '').padStart(9, '0');
    tableHTML += `<tr id="${paddedId}">
      <td><p>${cueStart}&nbsp;-->&nbsp;${cueEnd}</p>
      <p>${cueText || '&nbsp;'}</p></td>
    </tr>`;
  }

  tableHTML += '</tbody></table>';
  return tableHTML;
}

function vttToJSON(vttString) {
  const lines = vttString.trim().split('\n');
  
  if (lines[0].toLowerCase() === 'webvtt') {
    lines.shift();
  }

  const cues = [];
  let currentCue = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '') {
      currentCue = null;
      continue;
    }

    if (line.includes('-->')) {
      const [startTime, endTime] = line.split('-->').map(t => t.trim());
      currentCue = {
        StartTime: startTime,
        EndTime: endTime,
        Comment: '',
        Text: ''
      };
      cues.push(currentCue);
    } else if (currentCue) {
      if (line.startsWith('NOTE') && currentCue.Text === '') {
        currentCue.Comment += (currentCue.Comment ? '\n' : '') + line.substring(4).trim();
      } else {
        currentCue.Text += (currentCue.Text ? '\n' : '') + line;
      }
    }
  }

  return cues;
}
