export const catalogPublishedDestinationFilter = (destinationId: string) => ({
	_and: [{ destination_id: { _eq: destinationId } }, { status: { _eq: 'published' } }]
});
