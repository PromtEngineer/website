document.addEventListener('DOMContentLoaded', function() {
  // Create overlay element for expanded diagrams
  const overlay = document.createElement('div');
  overlay.className = 'mermaid-overlay';
  document.body.appendChild(overlay);

  // Wait for Mermaid diagrams to be rendered
  setTimeout(function() {
    // Find all Mermaid diagrams
    const diagrams = document.querySelectorAll('.mermaid');
    
    diagrams.forEach(function(diagram) {
      // Create wrapper for centering if not already wrapped
      if (!diagram.parentElement.classList.contains('mermaid-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        diagram.parentNode.insertBefore(wrapper, diagram);
        wrapper.appendChild(diagram);
      }
      
      // Add click handler for expanding
      diagram.addEventListener('click', function() {
        diagram.classList.toggle('expanded');
        overlay.classList.toggle('active');
      });
    });
    
    // Close expanded diagram when clicking outside
    overlay.addEventListener('click', function() {
      const expandedDiagram = document.querySelector('.mermaid.expanded');
      if (expandedDiagram) {
        expandedDiagram.classList.remove('expanded');
        overlay.classList.remove('active');
      }
    });
    
    // Close expanded diagram with ESC key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const expandedDiagram = document.querySelector('.mermaid.expanded');
        if (expandedDiagram) {
          expandedDiagram.classList.remove('expanded');
          overlay.classList.remove('active');
        }
      }
    });
  }, 1000); // Give Mermaid time to render
});
