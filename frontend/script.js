let token = '';

const register = async () => {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    if (!username || !password) {
        alert('Please provide both username and password');
        return;
    }
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    alert(data.message);
};

const login = async () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    if (!username || !password) {
        alert('Please provide both username and password');
        return;
    }
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.token) {
        token = data.token;
        document.getElementById('auth').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        loadFiles();
    } else {
        alert(data.message);
    }
};

const uploadFile = async () => {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a file');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    const data = await res.json();
    alert(data.message);
    loadFiles();
};

const loadFiles = async () => {
    const res = await fetch('/api/files', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    data.files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = `${file.original_name} (${(file.size / (1024 * 1024)).toFixed(2)} MB) `;

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download';
        downloadBtn.style.marginLeft = '10px';
        downloadBtn.onclick = () => downloadFile(file.id);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.marginLeft = '5px';
        deleteBtn.onclick = () => deleteFile(file.id);

        const shareBtn = document.createElement('button');
        shareBtn.textContent = 'Share';
        shareBtn.style.marginLeft = '5px';
        shareBtn.onclick = () => promptShareLink(file.id);

        li.appendChild(downloadBtn);
        li.appendChild(deleteBtn);
        li.appendChild(shareBtn);
        fileList.appendChild(li);
    });
};

const downloadFile = (id) => {
    window.location.href = `/api/files/${id}`;
};

const deleteFile = async (id) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    const res = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    alert(data.message);
    loadFiles();
};

const promptShareLink = async (id) => {
    const duration = prompt('Enter duration for the share link (in minutes):', '10');
    if (!duration || isNaN(duration) || duration <= 0) {
        alert('Invalid duration');
        return;
    }
    const durationNumber = parseInt(duration);
    const res = await fetch(`/api/share/${id}`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ duration: durationNumber })
    });
    const data = await res.json();
    if (data.shareUrl) {
        prompt('Shareable Link:', data.shareUrl);
    } else {
        alert(data.message);
    }
};
