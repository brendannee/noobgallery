const masonryLayout = new Masonry(document.querySelector('.gallery'), {
  itemSelector: '.grid-item',
  columnWidth: '.grid-sizer',
  gutter: '.gutter-sizer',
  percentPosition: true
})

imagesLoaded(document.querySelector('.gallery'), () => {
  masonryLayout.layout()
})

masonryLayout.on('layoutComplete', () => {
  document.querySelector('.gallery').classList.add('masonry')
});

lightGallery(document.getElementById('lightgallery'), {
  selector: '.grid-item'
})
