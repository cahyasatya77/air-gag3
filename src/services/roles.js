// Peran pengurus: 'pengurus' = semua dana; pengurus_jimpitan / pengurus_air = pencatatan & tagihan + kas dananya saja.
export const OPS_ROLES = ['pengurus', 'pengurus_jimpitan', 'pengurus_air'];

// Membuat periode tagihan: tidak untuk pengurus jimpitan.
export const PERIOD_ROLES = ['pengurus', 'pengurus_air'];

const FUND_ROLE = { jimpitan: 'pengurus_jimpitan', air: 'pengurus_air' };

export const isOps = (user) => user.roles.some((r) => r === 'administrator' || OPS_ROLES.includes(r));

export const canAccessFund = (user, fund) =>
  user.roles.some((r) => r === 'administrator' || r === 'pengurus' || r === FUND_ROLE[fund]);
