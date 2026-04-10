'use strict';

var PRODUCTS = {
  diamond_pack_15: {
    id: 'diamond_pack_15',
    title: 'Diamond Pack 15',
    amount: 3000,
    currency: 'KRW',
    grants: [{ type: 'currency', key: 'diamond', amount: 15 }],
  },
  diamond_pack_30: {
    id: 'diamond_pack_30',
    title: 'Diamond Pack 30',
    amount: 5000,
    currency: 'KRW',
    grants: [{ type: 'currency', key: 'diamond', amount: 30 }],
  },
  diamond_pack_50: {
    id: 'diamond_pack_50',
    title: 'Diamond Pack 50',
    amount: 7000,
    currency: 'KRW',
    grants: [{ type: 'currency', key: 'diamond', amount: 50 }],
  },
  diamond_pack_100: {
    id: 'diamond_pack_100',
    title: 'Diamond Pack 100',
    amount: 10000,
    currency: 'KRW',
    grants: [{ type: 'currency', key: 'diamond', amount: 100 }],
  },
};

function getProduct(productId) {
  return PRODUCTS[productId] || null;
}

function getAllProducts() {
  return Object.values(PRODUCTS);
}

module.exports = { getProduct, getAllProducts };
