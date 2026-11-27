function resolvePrideTarget(options, invokingUser) {
  const selectedMember = options.get('member');
  if (!selectedMember || selectedMember.value === invokingUser.id) {
    return invokingUser;
  }

  return options.getUser('member', true);
}

module.exports = { resolvePrideTarget };
