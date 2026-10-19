(() => {
  fetch('/release.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error();return response.json();}).then(release=>{
    const downloads=document.querySelector('#install-downloads'),checksums=document.querySelector('#checksum-list');
    const entries=Object.entries(release.assets||{}).filter(([,asset])=>asset.url);
    if(!entries.length){downloads.textContent='The Mac preview is being packaged. The complete source is available on GitHub.';return;}
    downloads.replaceChildren(); checksums.replaceChildren();
    for(const [architecture,asset] of entries){
      const link=document.createElement('a');link.className='download-option';link.href=asset.url;
      const label=document.createElement('span'),title=document.createElement('b'),description=document.createElement('small');
      title.textContent=architecture==='arm64'?'Download for Apple silicon':'Download for Intel Mac';
      description.textContent=`Cue ${release.version} · ${Math.ceil(asset.bytes/1048576)} MB · Developer preview`;
      label.append(title,description);link.append(label,document.createTextNode('↓'));downloads.append(link);
      const heading=document.createElement('p');heading.textContent=asset.filename;
      const hash=document.createElement('code');hash.textContent=asset.sha256;checksums.append(heading,hash);
    }
  }).catch(()=>{document.querySelector('#install-downloads').textContent='Preview information could not be loaded. Please check the GitHub releases page.';});
})();
