var RepoListItem = require('./repoListItem').RepoListItem;
exports.RepoGroup = React.createClass({
  render: function() {
    var listItems = [];
    for (var i=0; i<this.props.repos.length; i++) {
      var repo = this.props.repos[i];
      var key = this.props.index + '-' + i;
      listItems.push(<RepoListItem key={key} index={i} orgIndex={this.props.index} repo={repo} />)
    }
    var checkboxId = 'org-' + this.props.index;
    return (
      <li className="org-list-item">
        <input type="checkbox" className="filled-in" id={checkboxId} />
        <label htmlFor={checkboxId} className="org-name">
          {this.props.orgName}
        </label>
        <ul className="org-repos-list">{listItems}</ul>
      </li>
    );
  }
});
