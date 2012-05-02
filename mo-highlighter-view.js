MOHighligher = Backbone.View.extend({


	el: "#readium-content-container",

	initialize: function() {
		this.model.on("change:text_hash", this.highlight, this);
		this.model.on("change:playing", this.highlight, this);
		this.model.on("change:highlight_progress", this.toggleHighlights, this);
	},

	highlight: function() {
		if(this.model.shouldHighlight()) {
			var selector = "#" + this.model.get("text_hash");
			this.$(selector).addClass('readium-highlight');
		}
	},

	toggleHighlights: function() {
		this.$('.readium-highlight').toggleClass("readium-highlight", this.model.shouldHighlight());
	}

});


MOPlayerView = Backbone.View.extend({

	el: "#readium-mo-player",

	initialize: function() {
		this.model.on("change:playing", this.render, this);
	},

	render: function() {
		var playing = this.model.get("playing");
		this.$('#play-btn').toggle(!playing);
		this.$('#pause-btn').toggle(playing);
		return this;
	},

	events: {
		"click #play-btn": function(e) {
			this.model.play();
		},

		"click #pause-btn": function(e) {
			this.model.pause();
		},
	}
});