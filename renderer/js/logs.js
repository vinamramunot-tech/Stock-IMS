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
    if (oldItem && oldItem.id && oldItem.id.startsWith('emerald_')) {
      return this.diffEmerald(oldItem, newItem);
    }

    if (oldItem && oldItem.id && oldItem.id.startsWith('stone_')) {
      return this.diffStone(oldItem, newItem);
    }

    const changes = [];

    if (!oldItem) return changes; // For creations, no diff needed

    // 1. Basic Fields
    const basicFields = [
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'labourCost', label: 'Labour Cost', isCurrency: true },
      { key: 'wastage', label: 'Metal Wastage', isPercentage: true },
      { key: 'profitPercentage', label: 'Profit Percentage', isPercentage: true }
    ];

    basicFields.forEach(field => {
      const oldVal = oldItem[field.key] !== undefined ? oldItem[field.key] : '';
      const newVal = newItem[field.key] !== undefined ? newItem[field.key] : '';
      
      if (oldVal !== newVal) {
        changes.push({
          field: field.label,
          old: field.isCurrency ? `₹${Number(oldVal).toLocaleString()}` : (field.isPercentage ? `${oldVal}%` : oldVal),
          new: field.isCurrency ? `₹${Number(newVal).toLocaleString()}` : (field.isPercentage ? `${newVal}%` : newVal)
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

    // 3. Metals Array
    const oldMetals = oldItem.metals || [];
    const newMetals = newItem.metals || [];
    
    if (JSON.stringify(oldMetals) !== JSON.stringify(newMetals)) {
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
        return arr.map(s => `${s.type || 'Stone'} (${s.pieces ? s.pieces + ' pcs, ' : ''}${s.shape || ''}, ${s.weight} cts, @₹${Number(s.ratePerCarat).toLocaleString()})`).join(' | ');
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
        return arr.map(d => `${d.type || 'Diamond'} (${d.pieces ? d.pieces + ' pcs, ' : ''}${d.shape || ''}, ${d.weight} cts, @₹${Number(d.ratePerCarat).toLocaleString()})`).join(' | ');
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
   * Compare two emerald stock items and return the differences.
   * @param {Object} oldItem - Original emerald object
   * @param {Object} newItem - Updated emerald object
   * @returns {Array} List of changes: { field: string, old: any, new: any }
   */
  diffEmerald(oldItem, newItem) {
    const changes = [];

    if (!oldItem) return changes;

    const basicFields = [
      { key: 'stockType', label: 'Stock Type' },
      { key: 'lustreGrade', label: 'Lustre Grade' },
      { key: 'color', label: 'Pudia Number' },
      { key: 'pricePerCarat', label: 'Price per Carat', isCurrency: true },
      { key: 'pair', label: 'Is Pair' },
      { key: 'group', label: 'Group / Lot' }
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

    // Origins
    const oldOrigins = oldItem.origins || [];
    const newOrigins = newItem.origins || [];
    if (JSON.stringify(oldOrigins.sort()) !== JSON.stringify(newOrigins.sort())) {
      changes.push({
        field: 'Origins',
        old: oldOrigins.join(', ') || 'None',
        new: newOrigins.join(', ') || 'None'
      });
    }

    // Sizes Breakdown
    const oldSizes = oldItem.sizes || [];
    const newSizes = newItem.sizes || [];
    if (JSON.stringify(oldSizes) !== JSON.stringify(newSizes)) {
      const formatSizes = (arr) => {
        if (arr.length === 0) return 'None';
        return arr.map(s => `${s.shape || 'Unknown'} (${s.mm || 'N/A'}, ${s.pieces || 0} pcs, ${s.weight || 0} cts)`).join(' | ');
      };
      changes.push({
        field: 'Sizes Breakdown',
        old: formatSizes(oldSizes),
        new: formatSizes(newSizes)
      });
    }

    return changes;
  },

  /**
   * Compare two loose stone stock items and return the differences.
   * @param {Object} oldItem - Original stone object
   * @param {Object} newItem - Updated stone object
   * @returns {Array} List of changes: { field: string, old: any, new: any }
   */
  diffStone(oldItem, newItem) {
    const changes = [];

    if (!oldItem) return changes;

    const basicFields = [
      { key: 'type',         label: 'Stone Type' },
      { key: 'color',        label: 'Packet Number' },
      { key: 'lustreGrade',  label: 'Grade / Clarity' },
      { key: 'pricePerCarat', label: 'Price per Carat', isCurrency: true },
      { key: 'pair',         label: 'Is Pair' },
      { key: 'group',        label: 'Group / Lot' }
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

    // Origins
    const oldOrigins = oldItem.origins || [];
    const newOrigins = newItem.origins || [];
    if (JSON.stringify([...oldOrigins].sort()) !== JSON.stringify([...newOrigins].sort())) {
      changes.push({
        field: 'Origins',
        old: oldOrigins.join(', ') || 'None',
        new: newOrigins.join(', ') || 'None'
      });
    }

    // Sizes Breakdown
    const oldSizes = oldItem.sizes || [];
    const newSizes = newItem.sizes || [];
    if (JSON.stringify(oldSizes) !== JSON.stringify(newSizes)) {
      const formatSizes = (arr) => {
        if (arr.length === 0) return 'None';
        return arr.map(s => `${s.shape || 'Unknown'} (${s.mm || 'N/A'}, ${s.pieces || 0} pcs, ${s.weight || 0} cts)`).join(' | ');
      };
      changes.push({
        field: 'Sizes Breakdown',
        old: formatSizes(oldSizes),
        new: formatSizes(newSizes)
      });
    }

    return changes;
  },

  /**
   * Build a beautiful, concise summary text from a list of changes.
   */
  buildSummary(changes, actionName) {
    if (changes.length === 0) {
      return `${actionName} details.`;
    }
    const descriptions = changes.map(c => `Modified ${c.field} [${c.old} → ${c.new}]`);
    return `${actionName}: ` + descriptions.slice(0, 3).join(', ') + (descriptions.length > 3 ? ` (+${descriptions.length - 3} more changes)` : '');
  }
};

window.Logs = Logs;
