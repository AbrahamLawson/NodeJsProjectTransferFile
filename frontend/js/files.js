
document.addEventListener('DOMContentLoaded', async function() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Veuillez vous connecter pour voir vos fichiers.');
        window.location.href = 'login.html';
        return;
    }

    try {
        const filesResponse = await fetch('/api/files', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const filesResult = await filesResponse.json();
        const files = filesResult.files || [];
        const tableBody = document.getElementById('files-table-body');

        let usedBytes = 0;
        files.forEach(file => {
            usedBytes += file.size;
        });

        const totalBytes = 2 * 1024 * 1024 * 1024; // 2 GB
        const usedGB = (usedBytes / (1024 ** 3)).toFixed(2);
        const remainingGB = ((totalBytes - usedBytes) / (1024 ** 3)).toFixed(2);
        const usedPercentage = ((usedBytes / totalBytes) * 100).toFixed(2);
        const progressBar = document.getElementById('storage-progress');

        progressBar.style.width = `${usedPercentage}%`;
        progressBar.setAttribute('aria-valuenow', usedPercentage);
        progressBar.innerText = `${usedGB} GB`;

        document.getElementById('storage-text').innerText = `${usedGB} GB utilisés sur 2 GB`;

        files.forEach(file => {
            const tr = document.createElement('tr');
            const checkboxTd = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-checkbox';
            checkbox.value = file.id;
            checkboxTd.appendChild(checkbox);
            tr.appendChild(checkboxTd);

            
            const nameTd = document.createElement('td');
            nameTd.innerText = file.original_name;
            nameTd.contentEditable = false;
            nameTd.className = 'file-name';
            tr.appendChild(nameTd);

            const sizeTd = document.createElement('td');
            sizeTd.innerText = formatBytes(file.size);
            tr.appendChild(sizeTd);

            const dateTd = document.createElement('td');
            const uploadDate = new Date(file.upload_date);
            dateTd.innerText = uploadDate.toLocaleString();
            tr.appendChild(dateTd);

            const actionsTd = document.createElement('td');

            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-sm btn-success mr-2';
            downloadBtn.innerText = 'Télécharger';
            downloadBtn.addEventListener('click', () => downloadFile(file.id, file.original_name));
            actionsTd.appendChild(downloadBtn);

            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn btn-sm btn-warning mr-2';
            renameBtn.innerText = 'Renommer';
            renameBtn.addEventListener('click', () => renameFile(file.id, nameTd));
            actionsTd.appendChild(renameBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.innerText = 'Supprimer';
            deleteBtn.addEventListener('click', () => deleteFile(file.id));
            actionsTd.appendChild(deleteBtn);

            tr.appendChild(actionsTd);

            tableBody.appendChild(tr);
        });

        document.getElementById('select-all').addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.file-checkbox');
            checkboxes.forEach(cb => cb.checked = this.checked);
        });

        document.getElementById('share-btn').addEventListener('click', () => {
            const selectedFiles = getSelectedFiles();
            if (selectedFiles.length === 0) {
                alert('Veuillez sélectionner au moins un fichier à partager.');
                return;
            }
            $('#shareModal').modal('show');
        });

        document.getElementById('share-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const durationInput = document.getElementById('duration');
            const duration = parseInt(durationInput.value);
            if (isNaN(duration) || duration <= 0) {
                alert('Veuillez entrer une durée valide en minutes.');
                return;
            }

            const selectedFiles = getSelectedFiles();
            if (selectedFiles.length === 0) {
                alert('Veuillez sélectionner au moins un fichier à partager.');
                return;
            }

            try {
                const response = await fetch('/api/share', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        fileIds: selectedFiles,
                        duration: duration
                    })
                });

                const result = await response.json();
                const shareLinksDiv = document.getElementById('share-links');
                if (response.ok) {
                    shareLinksDiv.innerHTML = `
                        <div class="alert alert-success">
                            Lien de partage créé avec succès !
                            <div class="input-group mt-2">
                                <input type="text" class="form-control" value="${result.shareUrl}" readonly id="share-url-${Date.now()}" onclick="copyToClipboard('share-url-${Date.now()}')">
                                <div class="input-group-append">
                                    <button class="btn btn-outline-secondary" type="button" onclick="copyToClipboard('share-url-${Date.now()}')">Copier</button>
                                </div>
                            </div>
                            <small>Valide jusqu'à : ${new Date(result.shareExpiry).toLocaleString()}</small>
                        </div>
                    `;
                    fetchExistingShares();
                } else {
                    shareLinksDiv.innerHTML = `<div class="alert alert-danger">${result.message}</div>`;
                }
            } catch (error) {
                console.error('Erreur lors de la création du lien de partage:', error);
            }
        });
        document.getElementById('view-shares-btn').addEventListener('click', () => {
            $('#viewSharesModal').modal('show');
        });
        fetchExistingShares();
    } catch (error) {
        console.error('Erreur lors du chargement des fichiers:', error);
    }
});

async function downloadFile(fileId, fileName) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Veuillez vous connecter pour télécharger des fichiers.');
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`/api/files/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            const result = await response.json();
            alert(`Erreur: ${result.message}`);
        }
    } catch (error) {
        console.error('Erreur lors du téléchargement:', error);
    }
}

async function renameFile(fileId, nameTd) {
    const newName = prompt('Entrez le nouveau nom du fichier:', nameTd.innerText);
    if (!newName) return;

    const token = localStorage.getItem('token');
    if (!token) {
        alert('Veuillez vous connecter pour renommer des fichiers.');
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`/api/files/${fileId}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newName: newName })
        });

        const result = await response.json();
        if (response.ok) {
            alert(result.message);
            nameTd.innerText = newName;
        } else {
            alert(`Erreur: ${result.message}`);
        }
    } catch (error) {
        console.error('Erreur lors du renommage du fichier:', error);
    }
}

async function deleteFile(fileId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;

    const token = localStorage.getItem('token');
    try {
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (response.ok) {
            alert(result.message);
            window.location.reload();
        } else {
            alert(`Erreur: ${result.message}`);
        }
    } catch (error) {
        console.error('Erreur lors de la suppression du fichier:', error);
    }
}

function getSelectedFiles() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function copyToClipboard(elementId) {
    const copyText = document.getElementById(elementId);
    copyText.select();
    copyText.setSelectionRange(0, 99999); 

    navigator.clipboard.writeText(copyText.value)
        .then(() => {
            alert('Lien copié dans le presse-papiers !');
        })
        .catch(err => {
            console.error('Erreur lors de la copie:', err);
        });
}

async function fetchExistingShares() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/shares', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (response.ok) {
            const activeSharesBody = document.getElementById('active-shares-body');
            const expiredSharesBody = document.getElementById('expired-shares-body');
            activeSharesBody.innerHTML = ''; 
            expiredSharesBody.innerHTML = '';

            if (result.shares.length === 0) {
                activeSharesBody.innerHTML = '<tr><td colspan="4" class="text-center">Aucun lien de partage créé.</td></tr>';
                expiredSharesBody.innerHTML = '<tr><td colspan="4" class="text-center">Aucun lien de partage créé.</td></tr>';
                return;
            }

            const now = new Date();
            const activeShares = [];
            const expiredShares = [];

            result.shares.forEach(share => {
                const expiryDate = new Date(share.shareExpiry);
                if (now < expiryDate) {
                    activeShares.push(share);
                } else {
                    expiredShares.push(share);
                }
            });

            activeShares.sort((a, b) => new Date(b.shareExpiry) - new Date(a.shareExpiry));
            expiredShares.sort((a, b) => new Date(b.shareExpiry) - new Date(a.shareExpiry));

            if (activeShares.length === 0) {
                activeSharesBody.innerHTML = '<tr><td colspan="4" class="text-center">Aucun lien actif.</td></tr>';
            } else {
                activeShares.forEach(share => {
                    const tr = document.createElement('tr');

                    const nameTd = document.createElement('td');
                    nameTd.innerText = share.originalName;
                    tr.appendChild(nameTd);

                    const linkTd = document.createElement('td');
                    const linkInput = document.createElement('input');
                    linkInput.type = 'text';
                    linkInput.className = 'form-control';
                    linkInput.value = share.shareUrl;
                    linkInput.readOnly = true;
                    linkInput.id = `share-url-${share.id}`;
                    linkInput.style.cursor = 'pointer';
                    linkInput.addEventListener('click', () => {
                        linkInput.select();
                        navigator.clipboard.writeText(linkInput.value)
                            .then(() => {
                                alert('Lien copié dans le presse-papiers !');
                            })
                            .catch(err => {
                                console.error('Erreur lors de la copie:', err);
                            });
                    });

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'btn btn-sm btn-outline-secondary mt-2';
                    copyBtn.innerText = 'Copier';
                    copyBtn.addEventListener('click', () => copyToClipboard(`share-url-${share.id}`));

                    linkTd.appendChild(linkInput);
                    linkTd.appendChild(copyBtn);
                    tr.appendChild(linkTd);

                    const countdownTd = document.createElement('td');
                    countdownTd.id = `countdown-${share.id}`;
                    tr.appendChild(countdownTd);
                    activeSharesBody.appendChild(tr);
                    initializeCountdown(share.id, share.shareExpiry);
                });
            }

            if (expiredShares.length === 0) {
                expiredSharesBody.innerHTML = '<tr><td colspan="4" class="text-center">Aucun lien expiré.</td></tr>';
            } else {
                expiredShares.forEach(share => {
                    const tr = document.createElement('tr');

                    const nameTd = document.createElement('td');
                    nameTd.innerText = share.originalName;
                    tr.appendChild(nameTd);

                    const linkTd = document.createElement('td');
                    const linkInput = document.createElement('input');
                    linkInput.type = 'text';
                    linkInput.className = 'form-control';
                    linkInput.value = share.shareUrl;
                    linkInput.readOnly = true;
                    linkInput.id = `share-url-${share.id}`;
                    linkInput.style.cursor = 'pointer';
                    linkInput.addEventListener('click', () => {
                        linkInput.select();
                        navigator.clipboard.writeText(linkInput.value)
                            .then(() => {
                                alert('Lien copié dans le presse-papiers !');
                            })
                            .catch(err => {
                                console.error('Erreur lors de la copie:', err);
                            });
                    });

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'btn btn-sm btn-outline-secondary mt-2';
                    copyBtn.innerText = 'Copier';
                    copyBtn.addEventListener('click', () => copyToClipboard(`share-url-${share.id}`));

                    linkTd.appendChild(linkInput);
                    linkTd.appendChild(copyBtn);
                    tr.appendChild(linkTd);

                    const expiryTd = document.createElement('td');
                    const expiryDate = new Date(share.shareExpiry);
                    expiryTd.innerText = expiryDate.toLocaleString();
                    tr.appendChild(expiryTd);


                    expiredSharesBody.appendChild(tr);
                });
            }
        } else {
            console.error('Erreur lors de la récupération des liens de partage:', result.message);
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des liens de partage:', error);
    }
}

function initializeCountdown(shareId, expiry) {
    const countdownElement = document.getElementById(`countdown-${shareId}`);
    const expiryDate = new Date(expiry).getTime();

    const updateCountdown = () => {
        const now = new Date().getTime();
        const distance = expiryDate - now;

        if (distance < 0) {
            countdownElement.innerText = 'Lien expiré';
            clearInterval(interval);
            return;
        }

        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        countdownElement.innerText = `Valide dans ${hours}h ${minutes}m ${seconds}s`;
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);
}
