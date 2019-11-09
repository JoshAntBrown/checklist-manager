
const checklistRegex = () => /- \[[x ]\] (.*)\r?\n/g

const getReferencedIssues = `
  query getReferencedIssues($nodeId: ID!) {
    node(id: $nodeId) {
      ... on Issue {
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 20) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on Node {
                  id
                }
                ... on Comment {
                  body
                }
                ... on RepositoryNode {
                  repository {
                    nameWithOwner
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

const updateIssue = `
  mutation updateIssue($input: UpdateIssueInput!) {
    updateIssue(input: $input) {
      clientMutationId
    }
  }
`

module.exports = app => {
  app.log('Yay, the app was loaded!')

  const manageChecklists = async context => {
    const { action, issue, repository } = context.payload

    const issueIdentifier = `${repository['full_name']}#${issue.number}`
      .toLowerCase()

    // Extract related issues
    const { node } = await context.github.graphql(getReferencedIssues, {
      nodeId: issue['node_id'],
    })

    // Get body of related issues
    node.timelineItems.nodes
      .forEach(async ({ source }) => {
        const body = source.body + '\n'

        // Find closed issue in checklist within related issues
        const checklistItems = body.match(checklistRegex())
          .filter(item => {
            const haystack = item.toLowerCase()

            if (repository['full_name'] === source.repository.nameWithOwner) {
              if (item.includes(`#${issue.number}`)) return true
            }

            return item.includes(issueIdentifier)
          })

        // Update body of issue to check each item off
        const newBody = checklistItems.reduce((content, item) => {
          const checkmark = action === 'closed' ? 'x' : ' '
          console.log(action)
          const checkedItem = `- [${checkmark}]${item.slice(5)}`
          return body.replace(item, checkedItem)
        }, body)

        // Post the update back to GitHub
        await context.github.graphql(updateIssue, {
          input: {
            id: source.id,
            body: newBody.trimEnd(),
          }
        })
      })
  }

  app.on('issues.closed', manageChecklists)
  app.on('issues.reopened', manageChecklists)
}
