const neo4j = require('neo4j-driver');

test('intentional failure', () => {
  const fn = jest.fn();
  fn({ limit: neo4j.int(50) });
  
  expect(fn).toHaveBeenCalledWith({
    limit: expect.objectContaining({ low: 25 })
  });
});
