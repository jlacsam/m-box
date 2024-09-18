const SUBSCRIPTION_ID = '00000000';
const CLIENT_SECRET = '00000000';

document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('dropArea');
    const preview = document.getElementById('preview');
    const fileName = document.getElementById('fileName');
    const searchButton = document.getElementById('searchButton');
    const threshold = document.getElementById('threshold');
    const maxRows = document.getElementById('maxRows');
    const results = document.getElementById('results');

    let file;

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = '#f0f0f0';
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.style.backgroundColor = '';
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = '';
        file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/jpeg')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'inline-block';
                fileName.textContent = file.name;
            };
            reader.readAsDataURL(file);
        } else {
            alert('Please drop a JPEG image.');
        }
    });

    searchButton.addEventListener('click', () => {
        if (!file) {
            alert('Please drop an image first.');
            return;
        }

        const formData = new FormData();
        formData.append('image', file);

        fetch('/api/search/', {
            method: 'POST',
            headers: {
                'Subscription-ID': SUBSCRIPTION_ID,
                'Client-Secret': CLIENT_SECRET,
                'Similarity': threshold.value,
                'Max-Rows': maxRows.value
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                results.innerHTML = `<p>Error: ${data.error}</p>`;
            } else {
                displayResults(data);
            }
        })
        .catch(error => {
            results.innerHTML = `<p>Error: ${error.message}</p>`;
        });
    });

    function displayResults(data) {
        let html = '<table><tr><th>Face ID</th><th>File ID</th><th>Person ID</th><th>Time Start</th><th>Time End</th><th>Box</th><th>Confidence</th><th>Merged To</th></tr>';
        data.forEach(item => {
            html += `<tr>
                <td>${item.face_id}</td>
                <td>${item.file_id}</td>
                <td>${item.person_id}</td>
                <td>${formatTime(item.time_start)}</td>
                <td>${formatTime(item.time_end)}</td>
                <td>${JSON.stringify(item.box)}</td>
                <td>${item.confidence}</td>
                <td>${item.merged_to}</td>
            </tr>`;
        });
        html += '</table>';
        results.innerHTML = html;
    }

    function formatTime(seconds) {
        const date = new Date(seconds * 1000);
        return date.toISOString().substr(11, 12);
    }
});
