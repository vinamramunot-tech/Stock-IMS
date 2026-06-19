/**
 * In-App Image Editor Module
 * Manages native HTML5 Canvas cropping, rotation, and flipping.
 * Works without external dependencies to run safely in Electron, Tauri, and mobile webviews.
 */

const ImageEditor = {
  img: null,
  canvas: null,
  ctx: null,
  cropBoxEl: null,
  onSave: null,
  
  rotation: 0,
  flipH: false,
  flipV: false,
  
  cropBox: { left: 0, top: 0, width: 0, height: 0 },
  isDragging: false,
  isResizing: false,
  activeHandle: null,
  dragStart: { x: 0, y: 0 },
  cropBoxStart: { left: 0, top: 0, width: 0, height: 0 },
  
  init() {
    this.canvas = document.getElementById('image-editor-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.cropBoxEl = document.getElementById('image-editor-crop-box');
    
    // Wire up rotation/flip controls
    const btnRotL = document.getElementById('btn-editor-rotate-l');
    if (btnRotL) btnRotL.addEventListener('click', () => this.rotate(-90));
    
    const btnRotR = document.getElementById('btn-editor-rotate-r');
    if (btnRotR) btnRotR.addEventListener('click', () => this.rotate(90));
    
    const btnFlipH = document.getElementById('btn-editor-flip-h');
    if (btnFlipH) btnFlipH.addEventListener('click', () => this.flip('H'));
    
    const btnFlipV = document.getElementById('btn-editor-flip-v');
    if (btnFlipV) btnFlipV.addEventListener('click', () => this.flip('V'));
    
    // Close / Cancel triggers
    const closeTriggers = document.querySelectorAll('.modal-close-trigger-image-editor');
    closeTriggers.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });
    
    const btnSave = document.getElementById('btn-editor-save');
    if (btnSave) btnSave.addEventListener('click', () => this.save());
    
    // Wire up drag & resize events on the crop box and handles
    if (this.cropBoxEl) {
      this.cropBoxEl.addEventListener('mousedown', (e) => this.handleStart(e));
      this.cropBoxEl.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
    }
    
    window.addEventListener('mousemove', (e) => this.handleMove(e));
    window.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
    
    window.addEventListener('mouseup', () => this.handleEnd());
    window.addEventListener('touchend', () => this.handleEnd());
  },
  
  open(base64Image, onSaveCallback) {
    this.onSave = onSaveCallback;
    this.rotation = 0;
    this.flipH = false;
    this.flipV = false;
    
    this.img = new Image();
    this.img.onload = () => {
      UI.openModal('modal-image-editor');
      // Wait for modal to render to get container bounds correctly
      setTimeout(() => {
        this.render();
        this.initCropBox();
      }, 150);
    };
    this.img.onerror = () => {
      UI.showToast("Failed to load image for editing.", true);
    };
    this.img.src = base64Image;
  },
  
  close() {
    UI.closeModal('modal-image-editor');
  },
  
  render() {
    if (!this.img || !this.canvas || !this.ctx) return;
    
    // Determine canvas dimensions based on rotation
    const isRotated = this.rotation === 90 || this.rotation === 270;
    const w = isRotated ? this.img.naturalHeight : this.img.naturalWidth;
    const h = isRotated ? this.img.naturalWidth : this.img.naturalHeight;
    
    this.canvas.width = w;
    this.canvas.height = h;
    
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.save();
    
    // Rotate/Flip from center of canvas
    this.ctx.translate(w / 2, h / 2);
    this.ctx.rotate((this.rotation * Math.PI) / 180);
    this.ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
    this.ctx.drawImage(this.img, -this.img.naturalWidth / 2, -this.img.naturalHeight / 2);
    
    this.ctx.restore();
  },
  
  initCropBox() {
    if (!this.canvas || !this.cropBoxEl) return;
    
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    
    // Start with 80% coverage
    const w = canvasWidth * 0.8;
    const h = canvasHeight * 0.8;
    const left = this.canvas.offsetLeft + (canvasWidth - w) / 2;
    const top = this.canvas.offsetTop + (canvasHeight - h) / 2;
    
    this.cropBox = { left, top, width: w, height: h };
    this.updateCropBoxDOM();
  },
  
  updateCropBoxDOM() {
    if (!this.cropBoxEl) return;
    this.cropBoxEl.style.left = this.cropBox.left + 'px';
    this.cropBoxEl.style.top = this.cropBox.top + 'px';
    this.cropBoxEl.style.width = this.cropBox.width + 'px';
    this.cropBoxEl.style.height = this.cropBox.height + 'px';
  },
  
  rotate(degrees) {
    this.rotation = (this.rotation + degrees + 360) % 360;
    this.render();
    // After rotation, center crop box in the new canvas dimensions
    setTimeout(() => this.initCropBox(), 50);
  },
  
  flip(dir) {
    if (dir === 'H') this.flipH = !this.flipH;
    if (dir === 'V') this.flipV = !this.flipV;
    this.render();
  },
  
  getCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  },
  
  handleStart(e) {
    if (!this.canvas) return;
    const target = e.target;
    const coords = this.getCoords(e);
    
    if (e.cancelable) e.preventDefault();
    
    this.dragStart = coords;
    this.cropBoxStart = { ...this.cropBox };
    
    if (target.classList.contains('crop-handle')) {
      this.isResizing = true;
      if (target.classList.contains('tl')) this.activeHandle = 'tl';
      if (target.classList.contains('tr')) this.activeHandle = 'tr';
      if (target.classList.contains('bl')) this.activeHandle = 'bl';
      if (target.classList.contains('br')) this.activeHandle = 'br';
    } else {
      this.isDragging = true;
    }
  },
  
  handleMove(e) {
    if ((!this.isDragging && !this.isResizing) || !this.canvas) return;
    if (e.cancelable) e.preventDefault();
    
    const coords = this.getCoords(e);
    const dx = coords.x - this.dragStart.x;
    const dy = coords.y - this.dragStart.y;
    
    const canvasLeft = this.canvas.offsetLeft;
    const canvasTop = this.canvas.offsetTop;
    const canvasWidth = this.canvas.clientWidth;
    const canvasHeight = this.canvas.clientHeight;
    
    if (this.isDragging) {
      let left = this.cropBoxStart.left + dx;
      let top = this.cropBoxStart.top + dy;
      
      const maxLeft = canvasLeft + canvasWidth - this.cropBox.width;
      const maxTop = canvasTop + canvasHeight - this.cropBox.height;
      
      left = Math.max(canvasLeft, Math.min(left, maxLeft));
      top = Math.max(canvasTop, Math.min(top, maxTop));
      
      this.cropBox.left = left;
      this.cropBox.top = top;
    } else if (this.isResizing) {
      const minSize = 30;
      
      if (this.activeHandle === 'br') {
        let w = this.cropBoxStart.width + dx;
        let h = this.cropBoxStart.height + dy;
        const maxW = canvasLeft + canvasWidth - this.cropBox.left;
        const maxH = canvasTop + canvasHeight - this.cropBox.top;
        
        this.cropBox.width = Math.max(minSize, Math.min(w, maxW));
        this.cropBox.height = Math.max(minSize, Math.min(h, maxH));
      } else if (this.activeHandle === 'tl') {
        let left = this.cropBoxStart.left + dx;
        let top = this.cropBoxStart.top + dy;
        
        left = Math.max(canvasLeft, Math.min(left, this.cropBoxStart.left + this.cropBoxStart.width - minSize));
        top = Math.max(canvasTop, Math.min(top, this.cropBoxStart.top + this.cropBoxStart.height - minSize));
        
        this.cropBox.width = this.cropBoxStart.width + (this.cropBoxStart.left - left);
        this.cropBox.height = this.cropBoxStart.height + (this.cropBoxStart.top - top);
        this.cropBox.left = left;
        this.cropBox.top = top;
      } else if (this.activeHandle === 'tr') {
        let top = this.cropBoxStart.top + dy;
        let w = this.cropBoxStart.width + dx;
        
        top = Math.max(canvasTop, Math.min(top, this.cropBoxStart.top + this.cropBoxStart.height - minSize));
        
        const maxW = canvasLeft + canvasWidth - this.cropBox.left;
        
        this.cropBox.width = Math.max(minSize, Math.min(w, maxW));
        this.cropBox.height = this.cropBoxStart.height + (this.cropBoxStart.top - top);
        this.cropBox.top = top;
      } else if (this.activeHandle === 'bl') {
        let left = this.cropBoxStart.left + dx;
        let h = this.cropBoxStart.height + dy;
        
        left = Math.max(canvasLeft, Math.min(left, this.cropBoxStart.left + this.cropBoxStart.width - minSize));
        
        const maxH = canvasTop + canvasHeight - this.cropBox.top;
        
        this.cropBox.width = this.cropBoxStart.width + (this.cropBoxStart.left - left);
        this.cropBox.left = left;
        this.cropBox.height = Math.max(minSize, Math.min(h, maxH));
      }
    }
    
    this.updateCropBoxDOM();
  },
  
  handleEnd() {
    this.isDragging = false;
    this.isResizing = false;
    this.activeHandle = null;
  },
  
  save() {
    if (!this.img || !this.canvas) return;
    
    // Scale coordinates from screen DOM space back to actual backing resolution
    const scaleX = this.canvas.width / this.canvas.clientWidth;
    const scaleY = this.canvas.height / this.canvas.clientHeight;
    
    const relLeft = this.cropBox.left - this.canvas.offsetLeft;
    const relTop = this.cropBox.top - this.canvas.offsetTop;
    
    const cropX = relLeft * scaleX;
    const cropY = relTop * scaleY;
    const cropW = this.cropBox.width * scaleX;
    const cropH = this.cropBox.height * scaleY;
    
    if (cropW <= 0 || cropH <= 0) {
      UI.showToast("Invalid crop selection.", true);
      return;
    }
    
    // Create temporary canvas to cut the selected rectangle
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.drawImage(
      this.canvas,
      cropX, cropY, cropW, cropH,
      0, 0, cropW, cropH
    );
    
    const croppedBase64 = tempCanvas.toDataURL('image/jpeg', 0.92);
    if (this.onSave) {
      this.onSave(croppedBase64);
    }
    this.close();
  }
};

window.ImageEditor = ImageEditor;
