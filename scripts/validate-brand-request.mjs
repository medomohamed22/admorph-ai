import sharp from 'sharp';
const data=(await sharp({create:{width:128,height:128,channels:3,background:'#227744'}}).jpeg().toBuffer()).toString('base64');
const response=await fetch('http://localhost:3000/api/ai/brand-extract/validate',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({providerId:'meta',apiKey:'local-validation-fixture-not-a-real-key',modelId:'muse-spark-1.3-contributor',consent:true,imageConsent:true,image:{mimeType:'image/jpeg',data}})});
const result=await response.json();console.log(JSON.stringify({httpStatus:response.status,...result}));if(!response.ok)process.exitCode=1;
