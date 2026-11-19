function resolvePrideTarget(options, invokingUser) {
  const selectedMember = options.get('member', true);
  if (selectedMember.value === invokingUser.id) {
    return invokingUser;
  }

  return options.getUser('member', true);
}

module.exports = { resolvePrideTarget };
