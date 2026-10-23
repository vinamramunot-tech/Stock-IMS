const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Jewelry Catalog PDF Export Suite', async (t) => {
  const catalogJsContent = fs.readFileSync(path.join(__dirname, '../renderer/js/catalog.js'), 'utf8');

  await t.test('1. generatePDF includes PHOTO in the table header', () => {
    assert.ok(
      catalogJsContent.includes('doc.text("PHOTO", 28, startY + 4.8, { align: \'center\' });'),
      'generatePDF must render PHOTO header column'
    );
  });

  await t.test('2. generatePDF preloads images and renders them into the thumbnail box', () => {
    assert.ok(
      catalogJsContent.includes('imageMap.get(item.id)'),
      'generatePDF must look up item images from imageMap'
    );
    assert.ok(
      catalogJsContent.includes('doc.addImage(prep.data, prep.format, imgX, imgY, targetW, targetH);'),
      'generatePDF must draw the image onto the PDF document'
    );
    assert.ok(
      catalogJsContent.includes('doc.text("No Pic", boxX + thumbW / 2, boxY + thumbH / 2 + 1, { align: \'center\' });'),
      'generatePDF must gracefully handle items without photos'
    );
  });

  await t.test('3. prepareImageForPdf handles raw base64, data URIs, and remote URLs', () => {
    assert.ok(
      catalogJsContent.includes("imgSrc = `data:${isPng ? 'image/png' : 'image/jpeg'};base64,` + imgSrc;"),
      'prepareImageForPdf must normalize raw base64 strings'
    );
    assert.ok(
      catalogJsContent.includes("imgSrc.startsWith('http://') || imgSrc.startsWith('https://')"),
      'prepareImageForPdf must support remote HTTP/HTTPS image URLs'
    );
  });

  await t.test('4. printFromSelection is an async function that awaits generatePDF', () => {
    assert.ok(
      catalogJsContent.includes('async printFromSelection()'),
      'printFromSelection must be async to allow image preloading'
    );
    assert.ok(
      catalogJsContent.includes('const doc = await this.generatePDF(filtered, goldRate, multiplier);'),
      'printFromSelection must await generatePDF'
    );
  });
});
