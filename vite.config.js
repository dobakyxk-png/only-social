const fs = require('fs');
const path = require('path');
const { defineConfig } = require('vite');
function copyZmpAssets(){return {name:'copy-zmp-static-assets',writeBundle(){const source=path.resolve(process.cwd(),'zmp-public');const target=path.resolve(process.cwd(),'www');if(!fs.existsSync(source))throw new Error('zmp-public missing: '+source);fs.cpSync(source,target,{recursive:true,force:true});}};}
module.exports=defineConfig({base:'./',plugins:[copyZmpAssets()],build:{outDir:'www',emptyOutDir:true}});
