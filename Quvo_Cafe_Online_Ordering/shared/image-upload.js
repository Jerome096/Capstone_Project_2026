// Convert browser-readable tablet formats locally; the backend stores validated PNG/JPG.
async function quvoUploadImage(file) {
  if(!file||!file.size||file.size>2097152)throw new Error('Choose an image no larger than 2 MB.');
  const extension=(file.name.split('.').pop()||'').toLowerCase();
  const formats=['png','jpg','jpeg','webp','gif','bmp','avif','heic','heif'];
  if(!formats.includes(extension)&&!['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/avif','image/heic','image/heif'].includes(file.type))
    throw new Error('Choose a JPG, PNG, WebP, GIF, BMP, AVIF, or supported HEIC/HEIF image.');
  const url=URL.createObjectURL(file);
  try {
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(
        ['heic','heif'].includes(extension)?'This browser cannot read HEIC/HEIF. Export the photo as JPG or PNG, or upload a screenshot.':'This image cannot be read. Try a JPG or PNG screenshot.'));
      img.src=url;
    });
    if(image.naturalWidth>8000||image.naturalHeight>8000||image.naturalWidth*image.naturalHeight>16000000)
      throw new Error('Choose an image up to 16 million pixels.');
    if(['image/png','image/jpeg'].includes(file.type))return file;
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image conversion is unavailable. Use JPG or PNG.');
    context.drawImage(image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Could not convert this image. Try JPG or PNG.');
    if(blob.size>2097152)throw new Error('The converted image exceeds 2 MB. Use a smaller image or screenshot.');
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.png',{type:'image/png'});
  } finally {URL.revokeObjectURL(url);}
}
