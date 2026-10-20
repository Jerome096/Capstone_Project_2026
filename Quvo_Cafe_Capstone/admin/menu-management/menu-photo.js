(() => {
  'use strict';
  const libraries=new Map();
  function load(name){
    if(!libraries.has(name))libraries.set(name,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=quvoPath('shared/image-decoders/'+name+'.js');script.onload=resolve;script.onerror=()=>{libraries.delete(name);reject(Error('The photo converter could not load. Check your connection and choose the photo again.'));};document.head.append(script);}));
    return libraries.get(name);
  }
  const dimensions=(width,height)=>{if(!width||!height||width>20000||height>20000||width*height>40000000)throw Error('Choose a photo with at most 40 million pixels.');};
  async function image(blob){const url=URL.createObjectURL(blob),img=new Image();try{img.src=url;await img.decode();dimensions(img.naturalWidth,img.naturalHeight);return img;}finally{URL.revokeObjectURL(url);}}
  async function prepare(file){
    if(!file||file.size===0||file.size>26214400)throw Error('Choose an image up to 25 MB.');
    let source;
    try{source=await image(file);}catch(nativeError){
      const head=new Uint8Array(await file.slice(0,64).arrayBuffer());
      const tiff=(head[0]===73&&head[1]===73&&head[2]===42)||(head[0]===77&&head[1]===77&&head[3]===42);
      const heic=/\.(heic|heif|hif)$/i.test(file.name)||/image\/(heic|heif)/i.test(file.type)||/ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/.test(new TextDecoder('latin1').decode(head));
      if(tiff){
        await load('pako');await load('utif');const buffer=await file.arrayBuffer(),page=UTIF.decode(buffer)[0];
        if(!page)throw Error('This TIFF does not contain a photo.');dimensions(page.t256?.[0],page.t257?.[0]);
        UTIF.decodeImage(buffer,page);const rgba=UTIF.toRGBA8(page);source=document.createElement('canvas');source.width=page.width;source.height=page.height;source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),page.width,page.height),0,0);
      }else if(heic){
        await load('heic-to');const converted=await HeicTo({blob:file,type:'image/jpeg',quality:0.9});source=await image(converted);
      }else throw Error('This image could not be opened. Try JPG, PNG, WebP, GIF, AVIF, BMP, SVG, HEIC or TIFF.');
    }
    const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;dimensions(width,height);
    const scale=Math.min(1,1600/width,1600/height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);
    let encoded;for(const quality of [0.9,0.8,0.65,0.5]){encoded=canvas.toDataURL('image/jpeg',quality);if(encoded.length<2796200)return encoded;}
    throw Error('This photo is still too large. Choose a smaller image.');
  }
  window.QuvoMenuPhoto={prepare};
})();
