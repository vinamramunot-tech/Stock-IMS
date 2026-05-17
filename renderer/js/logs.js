/**
 * Audit Trail Logs Engine for Mava Gems
 * Performs deep difference analysis between old and new states of objects
 * to output descriptive audit trails.
 */

const Logs = {
  /**
   * Compare two jewelry items and return the differences.
   * @param {Object} oldItem - Original item object
   * @param {Object} newItem - Updated item object
   * @returns {Array} List of changes: { field: string, old: any, new: any }
   */
  diffItem(oldItem, newItem) {
    const changes = [];

    if (!oldItem) return changes; // For creations, no diff needed

    // 1. Basic Fields
    const basicFields = [
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'labourCost', label: 'Labour Cost', isCurrency: true }
    ];

    basicFields.forEach(field => {
      const oldVal = oldItem[field.key] !== undefined ? oldItem[field.key] : '';
      const newVal = newItem[field.key] !== undefined ? newItem[field.key] : '';
      
      if (oldVal !== newVal) {
        changes.push({
          field: field.label,
          old: field.isCurrency ? `₹${Number(oldVal).toLocaleString()}` : oldVal,
          new: field.isCurrency ? `₹${Number(newVal).toLocaleString()}` : newVal
        });
      }
    });

    // 2. Commission
    const oldComm = oldItem.commission || { value: 0, isManual: false };
    const newComm = newItem.commission || { value: 0, isManual: false };
    if (oldComm.value !== newComm.value || oldComm.isManual !== newComm.isManual) {
      changes.push({
        field: 'Commission',
        old: `₹${Number(oldComm.value).toLocaleString()} (${oldComm.isManual ? 'Manual' : 'Auto'})`,
        new: `₹${Number(newComm.value).toLocaleString()} (${newComm.isManual ? 'Manual' : 'Auto'})`
      });
    }

    // 3. Metals Array (Simplify by listing stringified parts comparison or checking structural differences)
    const oldMetals = oldItem.metals || [];
    const newMetals = newItem.metals || [];
    
    if (JSON.stringify(oldMetals) !== JSON.stringify(newMetals)) {
      // Build visual representations
      const formatMetals = (arr) => {
        if (arr.length === 0) return 'None';
        return arr.map(m => `${m.name || 'Body'} (${m.karat}KT, ${m.weight}g)`).join(' | ');
      };
      changes.push({
        field: 'Metal Components',
        old: formatMetals(oldMetals),
        new: formatMetals(newMetals)
      });
    }

    // 4. Stones Array
    const oldStones = oldItem.stones || [];
    const newStones = newItem.stones || [];
    if (JSON.stringify(oldStones) !== JSON.stringify(newStones)) {
      const formatStones = (arr) => {
        if (arr.length === 0) return 'None';
        return arr.map(s => `${s.type || 'Stone'} (${s.shape || ''}, ${s.weight} cts, @₹${Number(s.ratePerCarat).toLocaleString()})`).join(' | ');
      };
      changes.push({
        field: 'Stone Details',
        old: formatStones(oldStones),
        new: formatStones(newStones)
      });
    }

    // 5. Diamonds & Polki Array
    const oldDP = oldItem.diamondsPolki || [];
    const newDP = newItem.diamondsPolki || [];
    if (JSON.stringify(oldDP) !== JSON.stringify(newDP)) {
      const formatDP = (arr) => {
        if (arr.length === 0) return 'None';
        return arr.map(d => `${d.type || 'Diamond'} (${d.shape || ''}, ${d.weight} cts, @₹${Number(d.ratePerCarat).toLocaleString()})`).join(' | ');
      };
      changes.push({
        field: 'Diamond / Polki Details',
        old: formatDP(oldDP),
        new: formatDP(newDP)
      });
    }

    // 6. Image change
    const oldImg = oldItem.image ? 'Present' : 'None';
    const newImg = newItem.image ? 'Present' : 'None';
    if (oldImg !== newImg) {
      changes.push({
        field: 'Image',
        old: oldImg,
        new: newImg
      });
    }

    return changes;
  },

  /**
   * Build a beautiful, concise summary text from a list of changes.
   */
  buildSummary(changes, actionName) {
    if (changes.length === 0) {
      return `${actionName} jewelry item details.`;
    }
    const descriptions = changes.map(c => `Modified ${c.field} [${c.old} → ${c.new}]`);
    return `${actionName}: ` + descriptions.slice(0, 3).join(', ') + (descriptions.length > 3 ? ` (+${descriptions.length - 3} more changes)` : '');
  }
};

window.Logs = Logs;
