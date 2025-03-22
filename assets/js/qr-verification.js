class QRVerification {
    constructor() {
        this.tokenExpiration = 10 * 60 * 1000; // 10 minutes in milliseconds
    }

    // Generate a unique verification token
    generateVerificationToken(userId) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        return {
            userId: userId,
            token: `${userId}-${randomString}-${timestamp}`,
            created: timestamp,
            expires: timestamp + this.tokenExpiration
        };
    }

    // Generate a QR code for a user
    generateUserQR(userId, containerId) {
        const tokenData = this.generateVerificationToken(userId);
        this.saveToken(userId, tokenData);
        
        const qrContainer = document.getElementById(containerId);
        if (qrContainer) {
            qrContainer.innerHTML = ''; // Clear previous QR code
            
            // Use QRCode library to generate QR code
            new QRCode(qrContainer, {
                text: JSON.stringify(tokenData),
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            
            // Add expiration info
            const expiryInfo = document.createElement('p');
            expiryInfo.className = 'expiry-info';
            expiryInfo.textContent = `This QR code will expire in 10 minutes.`;
            qrContainer.appendChild(expiryInfo);
            
            return tokenData;
        }
        return null;
    }

    // Save token to storage (maintain last 3 tokens per user)
    saveToken(userId, tokenData) {
        const tokens = this.getUserTokens(userId);
        tokens.push(tokenData);
        
        // Keep only the last 3 tokens
        const updatedTokens = tokens.slice(-3);
        
        localStorage.setItem(`user_tokens_${userId}`, JSON.stringify(updatedTokens));
        return updatedTokens;
    }

    // Get user's active tokens
    getUserTokens(userId) {
        const tokensJson = localStorage.getItem(`user_tokens_${userId}`);
        return tokensJson ? JSON.parse(tokensJson) : [];
    }

    // Clear all tokens for a user
    clearUserTokens(userId) {
        localStorage.removeItem(`user_tokens_${userId}`);
    }

    // Verify a QR code
    verifyQRCode(qrData) {
        try {
            const data = JSON.parse(qrData);
            
            // Check if token exists and has not expired
            if (!data.userId || !data.token || !data.expires) {
                return { valid: false, message: 'Invalid QR code format' };
            }
            
            if (Date.now() > data.expires) {
                return { valid: false, message: 'QR code has expired' };
            }
            
            // Verify the token exists in user's tokens
            const userTokens = this.getUserTokens(data.userId);
            const validToken = userTokens.find(t => t.token === data.token);
            
            if (!validToken) {
                return { valid: false, message: 'Invalid token' };
            }
            
            return { 
                valid: true, 
                userId: data.userId,
                message: 'QR code verified successfully' 
            };
        } catch (error) {
            console.error('QR verification error:', error);
            return { valid: false, message: 'Error processing QR code' };
        }
    }
}

class QRScanner {
    constructor(videoElementId, canvasElementId, resultElementId, onSuccessCallback) {
        this.video = document.getElementById(videoElementId);
        this.canvas = document.getElementById(canvasElementId);
        this.resultElement = document.getElementById(resultElementId);
        this.canvasContext = this.canvas.getContext('2d');
        this.scanning = false;
        this.onSuccessCallback = onSuccessCallback;
    }

    async startScanner() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" } 
            });
            this.video.srcObject = stream;
            this.video.setAttribute('playsinline', true); // Required for iOS
            this.video.play();
            this.scanning = true;
            requestAnimationFrame(() => this.scan());
            
            if (this.resultElement) {
                this.resultElement.textContent = 'Scanning for QR code...';
            }
        } catch (error) {
            console.error('Error starting scanner:', error);
            if (this.resultElement) {
                this.resultElement.textContent = 'Camera access denied or not available';
            }
        }
    }

    stopScanner() {
        this.scanning = false;
        if (this.video && this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
        }
    }

    scan() {
        if (!this.scanning) return;

        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            // Draw video frame to canvas
            this.canvas.height = this.video.videoHeight;
            this.canvas.width = this.video.videoWidth;
            this.canvasContext.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            
            // Get image data for QR code scanning
            const imageData = this.canvasContext.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            try {
                // Use jsQR library to detect QR code
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                
                if (code) {
                    // QR code detected
                    this.drawQRCodeOutline(code.location);
                    
                    if (this.resultElement) {
                        this.resultElement.textContent = 'QR code detected! Verifying...';
                    }
                    
                    // Process the QR code data
                    if (typeof this.onSuccessCallback === 'function') {
                        this.onSuccessCallback(code.data);
                        this.stopScanner();
                        return;
                    }
                }
            } catch (error) {
                console.error('QR scanning error:', error);
            }
        }
        
        // Continue scanning
        if (this.scanning) {
            requestAnimationFrame(() => this.scan());
        }
    }

    drawQRCodeOutline(location) {
        this.canvasContext.lineWidth = 4;
        this.canvasContext.strokeStyle = "#FF3B58";
        this.canvasContext.beginPath();
        
        // Draw outline around QR code
        this.canvasContext.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
        this.canvasContext.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        this.canvasContext.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
        this.canvasContext.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        this.canvasContext.lineTo(location.topLeftCorner.x, location.topLeftCorner.y);
        
        this.canvasContext.stroke();
    }
}

// Initialize the verification system when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.qrVerification = new QRVerification();
    
    // Check if we're on the QR code generation page
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer) {
        // Get user ID from session storage
        const userId = sessionStorage.getItem('userID') || sessionStorage.getItem('usn') || sessionStorage.getItem('staffID');
        
        if (userId) {
            // Generate QR code for the current user
            window.qrVerification.generateUserQR(userId, 'qrcode-container');
            
            // Setup regenerate button if it exists
            const regenerateBtn = document.getElementById('regenerate-qr');
            if (regenerateBtn) {
                regenerateBtn.addEventListener('click', function() {
                    window.qrVerification.generateUserQR(userId, 'qrcode-container');
                });
            }
        }
    }
    
    // Check if we're on the QR scanner page
    const scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) {
        const startScanBtn = document.getElementById('start-scan');
        if (startScanBtn) {
            startScanBtn.addEventListener('click', function() {
                // Initialize scanner
                const scanner = new QRScanner(
                    'qr-video', 
                    'qr-canvas', 
                    'scan-result',
                    function(qrData) {
                        // Verify the scanned QR code
                        const result = window.qrVerification.verifyQRCode(qrData);
                        const resultElement = document.getElementById('scan-result');
                        
                        if (resultElement) {
                            resultElement.textContent = result.message;
                            resultElement.className = result.valid ? 'success' : 'error';
                            
                            if (result.valid) {
                                // Redirect to voting page or process the verified user
                                sessionStorage.setItem('qr_verified', 'true');
                                sessionStorage.setItem('verified_user_id', result.userId);
                                
                                // Wait 2 seconds to show success message before redirecting
                                setTimeout(function() {
                                    window.location.href = 'vote.html';
                                }, 2000);
                            }
                        }
                    }
                );
                
                scanner.startScanner();
                
                // Update button to show stop scanning option
                startScanBtn.textContent = 'Stop Scanning';
                startScanBtn.onclick = function() {
                    scanner.stopScanner();
                    startScanBtn.textContent = 'Start Scanning';
                    startScanBtn.onclick = null; // Reset onclick to prevent multiple bindings
                    location.reload(); // Reload to reset the scanner
                };
            });
        }
    }
}); 