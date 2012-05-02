// mo-player.js
// plays a media overlay file

MOPlayer = Backbone.Model.extend({

    defaults: {
        playing: false, // status of the audio player (not playing by default)
        clip_url: "", // the url of the currently playing clip
        track_position: 0, // the time position in the currently playing audio clip
        smil_offset: 0, // our position within the smil datastructure that we built with parse
        highlight_progress: true // user setting to highligh progress through the book
    },

    // constructor
    initialize: function() {
        // create a loose html5 audio tag
        var src = this.get("clip_url");
        this.audio_elem = this.createAudioTag(src);

        // subscribe for events
        this.on("change:clip_url", this.setClipUrl, this);
        this.on("change:smil_offset", this.handleNewSmil, this);
        this.on("change:smils", this.handleNewSmil, this);
        this.on("change:playing", this.changePlayState, this);
        this.on("change:track_position", this.updateSmil, this);
    },

    // create an html5 audio tag
    createAudioTag: function(src) {
        var html_text = "<audio src='" + src + "' preload='auto' autobuffer></audio>"
        return $(html_text)[0]; //let jQuery do the dirty work, then dereference it
    },

    // start playing the MO from its current position
    play: function() {
        // start playing the 
        this.set("playing", true);
    },

    // pause playback of the mo
    pause: function() {
        this.set("playing", false);
    },

    // play or pause the audio_elem based on the
    // the state of "this"
    changePlayState: function() {
        if(this.get("playing")) {
            this.audio_elem.play();
            this.playbackLoop();
        }
        else {
            this.audio_elem.pause();
        }
    },

    // track progress through this based on progression
    // through this audio elem
    playbackLoop: function() {
        if(this.get("playing")) {
            var that = this;
            var position = this.audio_elem.currentTime;
            this.set("track_position", position);
            setTimeout(function() {
                that.playbackLoop(); // do it again in one second
            }, 100);
        }
    },

    // handle a change in the current smil offset
    handleNewSmil: function() {
        var smil = this.getCurrentSmil();
        this.set({ clip_url: smil.media_url });    
        this.set({ text_hash: smil.text_hash });
        this.set({ section_url: smil.section_url });         
    },

    // check and see if our current smill node corresponds 
    // to our current position the track
    updateSmil: function() {
        var smil = this.getCurrentSmil();
        var position = this.get("track_position");
        if(smil.start > position || smil.end < position) {
            this.setNewSmil();
        }
    },

    // update the smil offset to reflect the current position
    // in the MO track
    setNewSmil: function() {
        var position = this.get("track_position");
        var url = this.get("clip_url");
        var new_ind = -1;
        var smils = this.get("smils");
        var len = smils.length;
        for(var i = 0; i < len; i++) {
            if(smils[i].media_url === url && smils[i].start <= position && smils[i].end >= position) {
                new_ind = i;
                break;    
            }
        }

        // only update if we found a smil
        if(new_ind > -1) {
            this.set("smil_offset", new_ind);
        }
    },

    // change the url of the audio elem
    setClipUrl: function() {
        
        // for now lets pretend that everything has a url
        var smil = this.getCurrentSmil();

        var url = this.resolveUrl(this.get("clip_url"), "testdata/moby/");
        var that = this;

        // pause it before changing the URL
        this.audio_elem.pause();
        this.audio_elem.setAttribute("src", url);
        $(this.audio_elem).on("canplay", function() {
            $(this).on("seeked", function() {
                $(this).off("seeked");
                that.trigger("change:playing");    
            })
            $(this).off("canplay");
            that.audio_elem.currentTime = smil.start;
        });

    },

    // get the smil object representing our current place
    // in the doc
    getCurrentSmil: function() {
        var smils = this.get("smils");
        var i = this.get("smil_offset");
        return smils[i];
    },

    // backbone will manage the ajax for us, but it defaults to JSON requests so 
    // we just need to tell it we want xml.
    fetch: function(options) {
        options || (options = {});
        options.dataType="xml";
        Backbone.Model.prototype.fetch.call(this, options);
    },

    shouldHighlight: function() {
        return this.get("highlight_progress") && this.get("playing");
    },

    // after backone "fetch()'s" successfully, it will pass the data to this 
    // method for us to parse
    parse: function(dom) {

        // we should abandon the XML ASAP and build 
        // our own more useful datastructure, this is
        // what I have been doing all over readium.
        //
        // From my reading of the MO spec, basically we
        // need an in order array of objects that look like this:

        /*
        {
            media_url: the url of the actual media thing
            start: the begin time
            end: the end time of the clip position
            is_self: there is no audio elem because text points to media
            text_url: the src of the text elem
            text_hash: the hash of the text elem src
        }
        */
        var that = this; // <= capture scope

        if(typeof dom === "string") {
            // turn it into XML
            var parser = new DOMParser();
            dom = parser.parseFromString(dom, 'text/xml');
        }

        var smils = [];

        $('par', dom).each(function() {
            var smil = that.parsePar(this);
            if(smil) {
                // we return null if the par wasn't valid
                // so just skip to the next one
                smils.push(smil);    
            }
        });

        return { smils: smils };
        
    },

    // parse attrs of an individual <par> tag
    parsePar: function( par ) {
        var tnode = $('text', par);
        var audio = $('audio', par);
        var result = {}
        if( tnode.length < 1) {
            // the node is invalid, lets fail gracefully by pretending 
            // like none of this ever happened
            return null;
        }

        tnode = tnode[0].attributes; // dereference the $ obj

        result.text_url = this.stripFragment(tnode.src.nodeValue);
        result.text_hash = this.getFragment(tnode.src.nodeValue);
        if(audio.length < 1) {
            // there is no audio, so assume it text points to a
            // media elem
            result.is_self = true;
            return result;
        }

        audio = audio[0].attributes; // only care about the attrs
        result.media_url = audio.src.nodeValue;
        if(audio.clipBegin) {
            result.start = this.resolveClockValue(audio.clipBegin.nodeValue);    
        }
        else {
            // TODO what are we supposed to do here?
            result.start = 0;
        }
        if(audio.clipEnd) {
            result.end = this.resolveClockValue(audio.clipEnd.nodeValue);    
        }
        else {
            // TODO what are we supposed to do here?
            result.end = Infinity;
        }
        return result;
    },

    // assume both are full paths
    isSameDocument: function(url1, url2) {
        if (url1 == null || url2 == null) {
            return false;
        }
        return MOUtils.stripFragment(url1) == MOUtils.stripFragment(url2);
    },

    getFragment: function(url) {
        if (url.indexOf("#") != -1 && url.indexOf("#") < url.length -1) {
            return url.substr(url.indexOf("#")+1);
        }
        return "";
    },

    stripFragment: function(url) {
        if (url.indexOf("#") == -1) {
            return url;
        }
        else {
            return url.substr(0, url.indexOf("#"));
        }
    },

    resolveUrl: function(url, baseUrl) {
        if (url.indexOf("://") != -1) {
            return url;
        }
        
        var base = baseUrl;
        if (baseUrl[baseUrl.length-1] != "/") {
            base = baseUrl.substr(0, baseUrl.lastIndexOf("/") + 1);
        }
        return base + url;
    },

    // parse the timestamp and return the value in seconds
    // supports this syntax: http://idpf.org/epub/30/spec/epub30-mediaoverlays.html#app-clock-examples
    resolveClockValue: function(value) {        
        var hours = 0;
        var mins = 0;
        var secs = 0;
        
        // parse as hh:mm:ss.fraction
        if (value.indexOf(":") != -1) {
            arr = value.split(":");
            secs = parseFloat(arr.pop());
            if (arr.length > 0) {
                mins = parseFloat(arr.pop());
                if (arr.length > 0) {
                    hours = parseFloat(arr.pop());
                }
            }
        }
        // look for unit 's', 'h', 'min', 'ms'
        else {
            if (value.indexOf("min") != -1) {
                mins = parseFloat(value.substr(0, indexOf("min")));
            }
            else if (value.indexOf("ms") != -1) {
                var ms = parseFloat(value.substr(0, indexOf("ms")));
                secs = ms/1000;
            }
            else if (value.indexOf("s") != -1) {
                secs = parseFloat(value.substr(0, indexOf("s")));                
            }
            else if (value.indexOf("h") != -1) {
                hours = parseFloat(value.substr(0, indexOf("h")));                
            }
        }
        var total = hours * 3600 + mins * 60 + secs;
        return total;
    }
});