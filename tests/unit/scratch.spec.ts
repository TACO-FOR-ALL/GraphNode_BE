const neo4j = require('neo4j-driver');

test('test objectContaining with neo4j Integer', () => {
  const fn = jest.fn();
  fn({ limit: neo4j.int(25) });
  
  expect(fn).toHaveBeenCalledWith({
    limit: expect.objectContaining({ low: 25 })
  });
});
